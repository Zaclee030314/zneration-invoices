-- 001: Workspaces, members, profiles. Moves every table from per-user
-- (owner_id = auth.uid()) ownership to per-workspace ownership so a small team
-- can share one set of clients, documents and projects.
--
-- BACK UP THE DATABASE BEFORE RUNNING THIS (Dashboard -> Database -> Backups).
-- Run once in the SQL editor (or `supabase db push`). Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Core tenancy tables
-- ---------------------------------------------------------------------------
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists idx_members_user on workspace_members(user_id);

-- ---------------------------------------------------------------------------
-- 2. Helpers. SECURITY DEFINER so RLS policies on workspace_members can use
--    them without recursing into themselves.
-- ---------------------------------------------------------------------------
create or replace function my_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from workspace_members where user_id = auth.uid()
$$;

create or replace function default_workspace_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from workspace_members
  where user_id = auth.uid()
  order by created_at
  limit 1
$$;

create or replace function is_workspace_admin(ws uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members
    where workspace_id = ws and user_id = auth.uid() and role = 'admin'
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Backfill: a profile for every existing auth user, and one workspace per
--    existing data owner (admin). Idempotent: skips owners that already have
--    a workspace.
-- ---------------------------------------------------------------------------
insert into profiles (id, email)
select id, coalesce(email, '') from auth.users
on conflict (id) do nothing;

insert into workspaces (name, created_by)
select 'Zneration Media', o.owner_id
from (
  select owner_id from clients
  union
  select owner_id from invoices
) o
where o.owner_id is not null
  and not exists (select 1 from workspaces w where w.created_by = o.owner_id);

insert into workspace_members (workspace_id, user_id, role)
select id, created_by, 'admin' from workspaces where created_by is not null
on conflict (workspace_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. workspace_id on existing tables
-- ---------------------------------------------------------------------------
alter table clients          add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table invoices         add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table invoice_counters add column if not exists workspace_id uuid references workspaces(id) on delete cascade;

update clients c set workspace_id = w.id from workspaces w
  where c.workspace_id is null and w.created_by = c.owner_id;
update invoices i set workspace_id = w.id from workspaces w
  where i.workspace_id is null and w.created_by = i.owner_id;
-- invoice_counters.owner_id is dropped below, so guard for re-runs.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoice_counters' and column_name = 'owner_id'
  ) then
    update invoice_counters k set workspace_id = w.id from workspaces w
      where k.workspace_id is null and w.created_by = k.owner_id;
  end if;
end $$;

alter table clients
  alter column workspace_id set not null,
  alter column workspace_id set default default_workspace_id(),
  alter column owner_id set default auth.uid();
alter table invoices
  alter column workspace_id set not null,
  alter column workspace_id set default default_workspace_id(),
  alter column owner_id set default auth.uid();
alter table invoice_counters
  alter column workspace_id set not null,
  alter column workspace_id set default default_workspace_id();

-- The old per-owner policies reference owner_id; drop them before reshaping
-- the tables (workspace policies are created in section 6).
drop policy if exists owner_clients on clients;
drop policy if exists owner_invoices on invoices;
drop policy if exists owner_invoice_items on invoice_items;
drop policy if exists owner_counters on invoice_counters;

-- Numbering is per company, not per user.
alter table invoices drop constraint if exists invoices_owner_id_invoice_no_key;
alter table invoices drop constraint if exists invoices_workspace_no_key;
alter table invoices add constraint invoices_workspace_no_key unique (workspace_id, invoice_no);

do $$ begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'invoice_counters'::regclass and contype = 'p'
      and pg_get_constraintdef(oid) like '%owner_id%'
  ) then
    alter table invoice_counters drop constraint invoice_counters_pkey;
    alter table invoice_counters add primary key (workspace_id, category, yymm);
  end if;
end $$;
alter table invoice_counters drop column if exists owner_id;

create index if not exists idx_clients_ws on clients(workspace_id);
create index if not exists idx_invoices_ws_type_date on invoices(workspace_id, doc_type, invoice_date desc);

-- ---------------------------------------------------------------------------
-- 5. Numbering RPCs (atomic, workspace-keyed). The app calls these instead of
--    reading and writing invoice_counters itself.
-- ---------------------------------------------------------------------------
create or replace function next_invoice_no(p_category text, p_yymm text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_seq int;
  v_ws uuid := default_workspace_id();
begin
  if v_ws is null then
    raise exception 'not a member of any workspace';
  end if;
  insert into invoice_counters (workspace_id, category, yymm, last_seq)
  values (v_ws, p_category, p_yymm, 1)
  on conflict (workspace_id, category, yymm)
  do update set last_seq = invoice_counters.last_seq + 1
  returning last_seq into v_seq;
  return p_category || p_yymm || '-' || lpad(v_seq::text, 2, '0');
end;
$$;

-- Raise the counter to at least p_seq so auto-suggestions continue after a
-- manually typed number.
create or replace function sync_invoice_counter(p_category text, p_yymm text, p_seq int)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := default_workspace_id();
begin
  if v_ws is null then
    raise exception 'not a member of any workspace';
  end if;
  insert into invoice_counters (workspace_id, category, yymm, last_seq)
  values (v_ws, p_category, p_yymm, p_seq)
  on conflict (workspace_id, category, yymm)
  do update set last_seq = greatest(invoice_counters.last_seq, excluded.last_seq);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table profiles enable row level security;

drop policy if exists ws_select on workspaces;
create policy ws_select on workspaces for select
  using (id in (select my_workspace_ids()));
drop policy if exists ws_update on workspaces;
create policy ws_update on workspaces for update
  using (is_workspace_admin(id)) with check (is_workspace_admin(id));

drop policy if exists members_select on workspace_members;
create policy members_select on workspace_members for select
  using (workspace_id in (select my_workspace_ids()));
drop policy if exists members_admin_insert on workspace_members;
create policy members_admin_insert on workspace_members for insert
  with check (is_workspace_admin(workspace_id));
drop policy if exists members_admin_update on workspace_members;
create policy members_admin_update on workspace_members for update
  using (is_workspace_admin(workspace_id)) with check (is_workspace_admin(workspace_id));
drop policy if exists members_admin_delete on workspace_members;
create policy members_admin_delete on workspace_members for delete
  using (is_workspace_admin(workspace_id));

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (
    id = auth.uid()
    or id in (
      select user_id from workspace_members
      where workspace_id in (select my_workspace_ids())
    )
  );
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_self_insert on profiles;
create policy profiles_self_insert on profiles for insert
  with check (id = auth.uid());

-- Existing tables: replace owner policies with workspace policies.
drop policy if exists owner_clients on clients;
drop policy if exists ws_clients on clients;
create policy ws_clients on clients for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));

drop policy if exists owner_invoices on invoices;
drop policy if exists ws_invoices on invoices;
create policy ws_invoices on invoices for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));

drop policy if exists owner_invoice_items on invoice_items;
drop policy if exists ws_invoice_items on invoice_items;
create policy ws_invoice_items on invoice_items for all
  using (exists (
    select 1 from invoices i
    where i.id = invoice_items.invoice_id and i.workspace_id in (select my_workspace_ids())))
  with check (exists (
    select 1 from invoices i
    where i.id = invoice_items.invoice_id and i.workspace_id in (select my_workspace_ids())));

-- Counters are read by the form for the "next number" preview; all writes go
-- through the two SECURITY DEFINER RPCs above.
drop policy if exists owner_counters on invoice_counters;
drop policy if exists ws_counters on invoice_counters;
create policy ws_counters on invoice_counters for select
  using (workspace_id in (select my_workspace_ids()));
