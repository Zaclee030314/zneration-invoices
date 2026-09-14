-- 010: Expenses. Monthly bank statement PDFs (UOB, Public Bank) are imported into
-- bank_transactions; every payment out is then backed by supplier invoices,
-- receipts or agreements (expense_documents) or a written explanation.
-- Safe to re-run.
--
-- Statement PDFs and documents live in the private "attachments" bucket from 008:
--   {workspace_id}/statements/{statement_id}/{file}
--   {workspace_id}/expenses/{transaction_id}/{file}

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  bank text not null check (bank in ('UOB', 'PBB')),
  account_no text not null,
  account_name text,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, bank, account_no)
);

create table if not exists bank_statements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  account_id uuid not null references bank_accounts(id) on delete cascade,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  file_path text not null,
  file_name text not null,
  file_sha256 text not null,
  opening_balance numeric(14,2) not null,
  closing_balance numeric(14,2) not null,
  total_in numeric(14,2) not null,
  total_out numeric(14,2) not null,
  txn_count int not null,
  inserted_count int not null default 0,
  duplicate_count int not null default 0,
  parser_version text,
  validation jsonb not null default '{}'::jsonb,
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, file_sha256)
);
create index if not exists idx_bank_statements_account on bank_statements(account_id, period_start);

-- One row per bank line. The bank columns are fixed once imported; the team fills in
-- category, event (project) or free-text tag, and an explanation.
create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  account_id uuid not null references bank_accounts(id) on delete cascade,
  statement_id uuid not null references bank_statements(id),
  seq int not null,
  page int,
  posted_on date not null,
  txn_date date not null,
  txn_at timestamptz,
  direction text not null check (direction in ('in', 'out')),
  amount numeric(14,2) not null check (amount >= 0),
  balance numeric(14,2) not null,
  description text not null default '',
  desc_lines text[] not null default '{}',
  txn_type text,
  reference text,
  counterparty text,
  counterparty_key text generated always as (
    nullif(upper(regexp_replace(coalesce(counterparty, ''), '[^A-Za-z0-9]', '', 'g')), '')
  ) stored,
  fingerprint text not null,
  category text,
  category_source text check (category_source in ('auto', 'history', 'user')),
  project_id uuid references projects(id) on delete set null,
  tag text,
  explanation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, fingerprint)
);

alter table bank_transactions drop constraint if exists bank_transactions_category_check;
alter table bank_transactions add constraint bank_transactions_category_check check (
  category is null or category in (
    'advertising', 'event_costs', 'contractors', 'salary', 'staff_claim', 'rental', 'software',
    'purchases', 'transport', 'meals', 'professional_fees', 'tax_statutory', 'bank_charges',
    'refund', 'loan_advance', 'own_transfer', 'other', 'customer_payment', 'other_income'
  )
);
alter table bank_transactions drop constraint if exists bank_transactions_project_or_tag;
alter table bank_transactions add constraint bank_transactions_project_or_tag check (project_id is null or tag is null);

create index if not exists idx_bank_txn_ws_dir_date on bank_transactions(workspace_id, direction, txn_date);
create index if not exists idx_bank_txn_statement on bank_transactions(statement_id);
create index if not exists idx_bank_txn_counterparty on bank_transactions(workspace_id, counterparty_key);
create index if not exists idx_bank_txn_tag on bank_transactions(workspace_id, tag) where tag is not null;
create index if not exists idx_bank_txn_project on bank_transactions(project_id) where project_id is not null;

create table if not exists expense_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  transaction_id uuid not null references bank_transactions(id),
  kind text not null default 'receipt' check (kind in ('invoice', 'receipt', 'agreement', 'other')),
  file_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  note text,
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_expense_docs_txn on expense_documents(transaction_id);

drop trigger if exists trg_bank_accounts_updated on bank_accounts;
create trigger trg_bank_accounts_updated before update on bank_accounts
  for each row execute function set_updated_at();
drop trigger if exists trg_bank_transactions_updated on bank_transactions;
create trigger trg_bank_transactions_updated before update on bank_transactions
  for each row execute function set_updated_at();

-- What the bank printed is the record; only the team's own fields may change.
create or replace function protect_bank_transaction()
returns trigger language plpgsql as $$
begin
  if (new.account_id, new.posted_on, new.txn_date, new.txn_at, new.direction, new.amount, new.balance,
      new.description, new.fingerprint)
     is distinct from
     (old.account_id, old.posted_on, old.txn_date, old.txn_at, old.direction, old.amount, old.balance,
      old.description, old.fingerprint) then
    raise exception 'Bank transaction details come from the statement and cannot be edited.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bank_transactions_protect on bank_transactions;
create trigger trg_bank_transactions_protect before update on bank_transactions
  for each row execute function protect_bank_transaction();

-- ---------------------------------------------------------------------------
-- 2. RLS (workspace template)
-- ---------------------------------------------------------------------------
alter table bank_accounts enable row level security;
alter table bank_statements enable row level security;
alter table bank_transactions enable row level security;
alter table expense_documents enable row level security;

drop policy if exists ws_bank_accounts on bank_accounts;
create policy ws_bank_accounts on bank_accounts for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));

drop policy if exists ws_bank_statements on bank_statements;
create policy ws_bank_statements on bank_statements for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));

drop policy if exists ws_bank_transactions on bank_transactions;
create policy ws_bank_transactions on bank_transactions for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));

drop policy if exists ws_expense_documents on expense_documents;
create policy ws_expense_documents on expense_documents for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));

-- ---------------------------------------------------------------------------
-- 3. Views
-- ---------------------------------------------------------------------------
-- A payment out is done when it has a document or an explanation. Transfers
-- between the company's own accounts and zero-amount lines need neither.
create or replace view bank_transactions_view with (security_invoker = true) as
select t.*,
       a.bank,
       a.account_no,
       coalesce(nullif(btrim(a.label), ''), a.bank || ' ' || right(a.account_no, 4)) as account_label,
       p.code as project_code,
       p.name as project_name,
       p.kind as project_kind,
       coalesce(d.doc_count, 0) as doc_count,
       case
         when t.direction <> 'out' then null
         when coalesce(d.doc_count, 0) > 0
              or nullif(btrim(coalesce(t.explanation, '')), '') is not null
              or t.category = 'own_transfer'
              or t.amount = 0 then 'done'
         else 'needs_attention'
       end as status,
       case
         when t.direction <> 'out' then null
         when coalesce(d.doc_count, 0) > 0 then 'documents'
         when nullif(btrim(coalesce(t.explanation, '')), '') is not null then 'explanation'
         when t.category = 'own_transfer' then 'own_transfer'
         when t.amount = 0 then 'zero_amount'
       end as done_reason
from bank_transactions t
join bank_accounts a on a.id = t.account_id
left join projects p on p.id = t.project_id
left join (
  select transaction_id, count(*)::int as doc_count from expense_documents group by transaction_id
) d on d.transaction_id = t.id;

-- Free-text tags already used, for suggestions.
create or replace view bank_tags with (security_invoker = true) as
select workspace_id, btrim(tag) as tag, count(*)::int as use_count, max(updated_at) as last_used_at
from bank_transactions
where nullif(btrim(coalesce(tag, '')), '') is not null
group by workspace_id, btrim(tag);

-- ---------------------------------------------------------------------------
-- 4. Import and delete
-- ---------------------------------------------------------------------------
-- Imports one parsed statement atomically. Rows already imported from another
-- statement of the same account (same fingerprint) are skipped. The totals and
-- running balance are checked again here so rows that don't add up are never stored.
create or replace function import_bank_statement(p_workspace uuid, p_statement jsonb, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account uuid;
  v_statement uuid;
  v_existing uuid;
  v_count int;
  v_inserted int;
  v_in numeric(14,2);
  v_out numeric(14,2);
  v_opening numeric(14,2) := (p_statement->>'opening_balance')::numeric;
  v_closing numeric(14,2) := (p_statement->>'closing_balance')::numeric;
begin
  if p_workspace is null or p_workspace not in (select my_workspace_ids()) then
    raise exception 'You are not a member of this workspace.';
  end if;

  select count(*),
         coalesce(sum((r->>'amount')::numeric) filter (where r->>'direction' = 'in'), 0),
         coalesce(sum((r->>'amount')::numeric) filter (where r->>'direction' = 'out'), 0)
    into v_count, v_in, v_out
  from jsonb_array_elements(p_rows) r;

  if v_count <> (p_statement->>'txn_count')::int
     or v_in <> (p_statement->>'total_in')::numeric
     or v_out <> (p_statement->>'total_out')::numeric
     or v_opening + v_in - v_out <> v_closing then
    raise exception 'The statement totals do not add up, so nothing was imported.';
  end if;

  if exists (
    select 1
    from (
      select (r->>'balance')::numeric as balance,
             v_opening + sum(case when r->>'direction' = 'in' then 1 else -1 end * (r->>'amount')::numeric)
               over (order by (r->>'seq')::int) as running
      from jsonb_array_elements(p_rows) r
    ) x
    where x.balance <> x.running
  ) then
    raise exception 'The running balance does not add up, so nothing was imported.';
  end if;

  insert into bank_accounts (workspace_id, bank, account_no, account_name)
  values (p_workspace, p_statement->>'bank', p_statement->>'account_no', nullif(p_statement->>'account_name', ''))
  on conflict (workspace_id, bank, account_no)
    do update set account_name = coalesce(bank_accounts.account_name, excluded.account_name)
  returning id into v_account;

  select id into v_existing
  from bank_statements
  where account_id = v_account and file_sha256 = p_statement->>'file_sha256';
  if v_existing is not null then
    return jsonb_build_object('status', 'already_imported', 'statement_id', v_existing, 'account_id', v_account);
  end if;

  insert into bank_statements (
    id, workspace_id, account_id, period_start, period_end, file_path, file_name, file_sha256,
    opening_balance, closing_balance, total_in, total_out, txn_count, parser_version, validation
  )
  values (
    coalesce((p_statement->>'id')::uuid, gen_random_uuid()), p_workspace, v_account,
    (p_statement->>'period_start')::date, (p_statement->>'period_end')::date,
    p_statement->>'file_path', p_statement->>'file_name', p_statement->>'file_sha256',
    v_opening, v_closing, v_in, v_out, v_count,
    p_statement->>'parser_version', coalesce(p_statement->'validation', '{}'::jsonb)
  )
  returning id into v_statement;

  with ins as (
    insert into bank_transactions (
      workspace_id, account_id, statement_id, seq, page, posted_on, txn_date, txn_at, direction,
      amount, balance, description, desc_lines, txn_type, reference, counterparty, fingerprint,
      category, category_source
    )
    select p_workspace, v_account, v_statement,
           (r->>'seq')::int, (r->>'page')::int, (r->>'posted_on')::date, (r->>'txn_date')::date,
           (r->>'txn_at')::timestamptz, r->>'direction',
           (r->>'amount')::numeric, (r->>'balance')::numeric,
           coalesce(r->>'description', ''),
           coalesce(array(select jsonb_array_elements_text(r->'desc_lines')), '{}'),
           nullif(r->>'txn_type', ''), nullif(r->>'reference', ''), nullif(r->>'counterparty', ''),
           r->>'fingerprint',
           nullif(r->>'category', ''),
           case when nullif(r->>'category', '') is not null then 'auto' end
    from jsonb_array_elements(p_rows) r
    on conflict (account_id, fingerprint) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  -- Payees the team has always put in one category get that category again.
  update bank_transactions t
     set category = h.category, category_source = 'history'
    from (
      select counterparty_key, direction, min(category) as category
      from bank_transactions
      where workspace_id = p_workspace and category_source = 'user'
        and category is not null and counterparty_key is not null
      group by counterparty_key, direction
      having count(distinct category) = 1
    ) h
   where t.statement_id = v_statement
     and t.counterparty_key = h.counterparty_key
     and t.direction = h.direction
     and t.category is distinct from 'own_transfer';

  update bank_statements
     set inserted_count = v_inserted, duplicate_count = v_count - v_inserted
   where id = v_statement;

  return jsonb_build_object(
    'status', 'imported', 'statement_id', v_statement, 'account_id', v_account,
    'inserted', v_inserted, 'duplicates', v_count - v_inserted
  );
end;
$$;

-- Deletes a statement and its transactions. Transactions that another statement of
-- the same account also covers are kept and moved to that statement. Refuses while
-- any transaction that would be removed has documents. Returns the PDF path so the
-- caller can remove the file.
create or replace function delete_bank_statement(p_statement uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_path text;
  v_kept int;
  v_blocked int;
  v_deleted int;
begin
  select file_path into v_path from bank_statements where id = p_statement;
  if not found then
    raise exception 'Statement not found.';
  end if;

  with moved as (
    update bank_transactions t
       set statement_id = (
         select o.id from bank_statements o
         where o.account_id = t.account_id and o.id <> p_statement
           and t.posted_on between o.period_start and o.period_end
         order by o.created_at
         limit 1
       )
     where t.statement_id = p_statement
       and exists (
         select 1 from bank_statements o
         where o.account_id = t.account_id and o.id <> p_statement
           and t.posted_on between o.period_start and o.period_end
       )
    returning 1
  )
  select count(*) into v_kept from moved;

  select count(distinct d.transaction_id) into v_blocked
  from expense_documents d
  join bank_transactions t on t.id = d.transaction_id
  where t.statement_id = p_statement;
  if v_blocked > 0 then
    raise exception '% payment(s) from this statement have documents attached. Remove those documents first.', v_blocked;
  end if;

  delete from bank_transactions where statement_id = p_statement;
  get diagnostics v_deleted = row_count;
  delete from bank_statements where id = p_statement;

  return jsonb_build_object('file_path', v_path, 'deleted', v_deleted, 'kept', v_kept);
end;
$$;
