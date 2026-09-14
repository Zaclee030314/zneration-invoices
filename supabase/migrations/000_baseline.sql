-- Run this in the Supabase SQL editor once, on a fresh project.

create extension if not exists "pgcrypto";

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  reg_no text,
  address text,
  default_category text check (default_category in ('EVIV', 'ZMIV')),
  created_at timestamptz not null default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  invoice_no text not null,
  doc_type text not null default 'invoice' check (doc_type in ('invoice', 'receipt', 'quotation')),
  category text not null check (category in ('EVIV', 'ZMIV')),
  client_id uuid references clients(id) on delete set null,
  bill_to_name text not null,
  bill_to_reg_no text,
  bill_to_address text,
  invoice_date date not null default current_date,
  bank_name text,
  bank_account text,
  sales_tax_rate numeric not null default 0,
  discount numeric not null default 0,
  special_notes text,
  created_at timestamptz not null default now(),
  unique (owner_id, invoice_no)
);

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  line_total numeric,
  sort_order int not null default 0
);

-- `category` here is really the number-series key: EVIV/ZMIV for invoices,
-- EVRC/ZMRC for receipts.
create table if not exists invoice_counters (
  owner_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('EVIV', 'ZMIV', 'EVRC', 'ZMRC', 'EVQT', 'ZMQT')),
  yymm text not null,
  last_seq int not null default 0,
  primary key (owner_id, category, yymm)
);

create index if not exists idx_invoices_client on invoices(client_id);
create index if not exists idx_items_invoice on invoice_items(invoice_id);

-- Atomically reserves and returns the next invoice number for a
-- category+month, e.g. next_invoice_no('EVIV', '2607') -> 'EVIV2607-04'.
create or replace function next_invoice_no(p_category text, p_yymm text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int;
begin
  insert into invoice_counters (owner_id, category, yymm, last_seq)
  values (auth.uid(), p_category, p_yymm, 1)
  on conflict (owner_id, category, yymm)
  do update set last_seq = invoice_counters.last_seq + 1
  returning last_seq into v_seq;

  return p_category || p_yymm || '-' || lpad(v_seq::text, 2, '0');
end;
$$;

-- RLS: only the owner can see/manage their own rows.
alter table clients enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table invoice_counters enable row level security;

drop policy if exists "owner_clients" on clients;
create policy "owner_clients" on clients
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "owner_invoices" on invoices;
create policy "owner_invoices" on invoices
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "owner_invoice_items" on invoice_items;
create policy "owner_invoice_items" on invoice_items
  for all using (exists (
    select 1 from invoices i where i.id = invoice_items.invoice_id and i.owner_id = auth.uid()))
  with check (exists (
    select 1 from invoices i where i.id = invoice_items.invoice_id and i.owner_id = auth.uid()));

drop policy if exists "owner_counters" on invoice_counters;
create policy "owner_counters" on invoice_counters
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
