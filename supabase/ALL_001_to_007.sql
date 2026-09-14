-- Combined migrations 001-007 for an EXISTING invoice-generator database.
-- Generated from supabase/migrations/*.sql. Back up first, then paste into the SQL editor.
-- Safe to re-run.


-- =====================================================================
-- 001_workspaces.sql
-- =====================================================================

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


-- =====================================================================
-- 002_invites.sql
-- =====================================================================

-- 002: Team invites. An admin records an invite; when that email signs up
-- (via the Supabase invite email) the trigger auto-joins the workspace.
-- Safe to re-run.

create table if not exists workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (workspace_id, email)
);

alter table workspace_invites enable row level security;
drop policy if exists invites_admin on workspace_invites;
create policy invites_admin on workspace_invites for all
  using (is_workspace_admin(workspace_id))
  with check (is_workspace_admin(workspace_id));

-- On auth.users insert: create the profile and accept any pending invites
-- addressed to this email.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(profiles.full_name, excluded.full_name);

  insert into workspace_members (workspace_id, user_id, role)
  select workspace_id, new.id, role
  from workspace_invites
  where lower(email) = lower(new.email) and accepted_at is null
  on conflict (workspace_id, user_id) do nothing;

  update workspace_invites
  set accepted_at = now()
  where lower(email) = lower(new.email) and accepted_at is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Keep profiles.email in sync if a user changes their email.
create or replace function handle_user_email_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function handle_user_email_change();


-- =====================================================================
-- 003_crm.sql
-- =====================================================================

-- 003: Light CRM. Clients gain a status and contact details; contacts, notes
-- and the projects table (the unit of engagement; carries the pipeline stage).
-- Safe to re-run.

alter table clients
  add column if not exists status text not null default 'active',
  add column if not exists industry text,
  add column if not exists website text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists source text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table clients drop constraint if exists clients_status_check;
alter table clients add constraint clients_status_check
  check (status in ('lead', 'active', 'dormant', 'lost'));

-- One client name per workspace, unless the live data already has duplicates
-- (then the index is skipped and a notice is raised; dedupe by hand later).
do $$ begin
  if exists (
    select 1 from clients group by workspace_id, lower(name) having count(*) > 1
  ) then
    raise notice 'clients: duplicate names exist, skipping unique index idx_clients_ws_name';
  else
    create unique index if not exists idx_clients_ws_name on clients(workspace_id, lower(name));
  end if;
end $$;

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_contacts_client on contacts(client_id);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  code text not null,
  name text not null,
  description text,
  kind text not null default 'software'
    check (kind in ('software', 'marketing', 'content', 'event', 'internal')),
  stage text not null default 'lead'
    check (stage in ('lead', 'proposal', 'active', 'beta', 'handover', 'done', 'lost', 'dormant')),
  stage_position float8 not null default 0,
  contract_value numeric,
  currency text not null default 'MYR',
  start_date date,
  due_date date,
  lead_user_id uuid references profiles(id) on delete set null,
  url text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workspace_id, code)
);
create index if not exists idx_projects_ws_stage on projects(workspace_id, stage);
create index if not exists idx_projects_client on projects(client_id);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  author_id uuid default auth.uid() references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  check (client_id is not null or project_id is not null)
);
create index if not exists idx_notes_client on notes(client_id);
create index if not exists idx_notes_project on notes(project_id);

-- Generic updated_at trigger, reused by later tables.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_clients_updated on clients;
create trigger trg_clients_updated before update on clients
  for each row execute function set_updated_at();
drop trigger if exists trg_projects_updated on projects;
create trigger trg_projects_updated before update on projects
  for each row execute function set_updated_at();

-- RLS (workspace template)
alter table contacts enable row level security;
alter table projects enable row level security;
alter table notes enable row level security;

drop policy if exists ws_contacts on contacts;
create policy ws_contacts on contacts for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));

drop policy if exists ws_projects on projects;
create policy ws_projects on projects for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));

drop policy if exists ws_notes on notes;
create policy ws_notes on notes for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));


-- =====================================================================
-- 004_projects_tasks.sql
-- =====================================================================

-- 004: Milestones, tasks, comments, activity log. Safe to re-run.

alter table projects
  add column if not exists priority text not null default 'medium',
  add column if not exists health text not null default 'on_track',
  add column if not exists quotation_id uuid references invoices(id) on delete set null;

alter table projects drop constraint if exists projects_priority_check;
alter table projects add constraint projects_priority_check
  check (priority in ('low', 'medium', 'high', 'urgent'));
alter table projects drop constraint if exists projects_health_check;
alter table projects add constraint projects_health_check
  check (health in ('on_track', 'at_risk', 'blocked'));

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'done')),
  sort_order int not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_milestones_project on milestones(project_id, sort_order);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  milestone_id uuid references milestones(id) on delete set null,
  parent_id uuid references tasks(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('backlog', 'todo', 'in_progress', 'review', 'done')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  assignee_id uuid references profiles(id) on delete set null,
  due_date date,
  position float8 not null default 0,
  estimate_min int,
  labels text[] not null default '{}',
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists idx_tasks_board on tasks(project_id, status, position);
create index if not exists idx_tasks_assignee_due
  on tasks(workspace_id, assignee_id, due_date) where status <> 'done';

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid default auth.uid() references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_comments_task on task_comments(task_id);

create table if not exists activity_log (
  id bigserial primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  project_id uuid references projects(id) on delete cascade,
  action text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_project on activity_log(project_id, created_at desc);
create index if not exists idx_activity_entity on activity_log(entity_type, entity_id);
create index if not exists idx_activity_ws on activity_log(workspace_id, created_at desc);

-- Bookkeeping: updated_at, done_at.
create or replace function tasks_before_write()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.done_at = now();
  elsif new.status <> 'done' then
    new.done_at = null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_tasks_before on tasks;
create trigger trg_tasks_before before insert or update on tasks
  for each row execute function tasks_before_write();

-- Activity: task created / status changed.
create or replace function log_task_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into activity_log (workspace_id, actor_id, entity_type, entity_id, project_id, action, data)
    values (new.workspace_id, auth.uid(), 'task', new.id, new.project_id, 'created',
            jsonb_build_object('title', new.title));
  elsif old.status is distinct from new.status then
    insert into activity_log (workspace_id, actor_id, entity_type, entity_id, project_id, action, data)
    values (new.workspace_id, auth.uid(), 'task', new.id, new.project_id, 'status_changed',
            jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status));
  elsif old.assignee_id is distinct from new.assignee_id then
    insert into activity_log (workspace_id, actor_id, entity_type, entity_id, project_id, action, data)
    values (new.workspace_id, auth.uid(), 'task', new.id, new.project_id, 'assigned',
            jsonb_build_object('title', new.title, 'to', new.assignee_id));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_tasks_log on tasks;
create trigger trg_tasks_log after insert or update on tasks
  for each row execute function log_task_activity();

-- Activity: project created / stage changed.
create or replace function log_project_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into activity_log (workspace_id, actor_id, entity_type, entity_id, project_id, action, data)
    values (new.workspace_id, auth.uid(), 'project', new.id, new.id, 'created',
            jsonb_build_object('name', new.name));
  elsif old.stage is distinct from new.stage then
    insert into activity_log (workspace_id, actor_id, entity_type, entity_id, project_id, action, data)
    values (new.workspace_id, auth.uid(), 'project', new.id, new.id, 'stage_changed',
            jsonb_build_object('name', new.name, 'from', old.stage, 'to', new.stage));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_projects_log on projects;
create trigger trg_projects_log after insert or update on projects
  for each row execute function log_project_activity();

-- Milestone done bookkeeping.
create or replace function milestones_before_write()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at = now();
  elsif new.status <> 'done' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_milestones_before on milestones;
create trigger trg_milestones_before before insert or update on milestones
  for each row execute function milestones_before_write();

-- Re-space positions in one column when float gaps get too small.
create or replace function renormalize_task_positions(p_project uuid, p_status text)
returns void
language sql security definer set search_path = public as $$
  with ranked as (
    select id, row_number() over (order by position, created_at) * 1000.0 as pos
    from tasks where project_id = p_project and status = p_status
  )
  update tasks t set position = r.pos from ranked r where t.id = r.id
$$;

-- RLS
alter table milestones enable row level security;
alter table tasks enable row level security;
alter table task_comments enable row level security;
alter table activity_log enable row level security;

drop policy if exists ws_milestones on milestones;
create policy ws_milestones on milestones for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));

drop policy if exists ws_tasks on tasks;
create policy ws_tasks on tasks for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));

drop policy if exists ws_task_comments on task_comments;
create policy ws_task_comments on task_comments for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));

drop policy if exists ws_activity_select on activity_log;
create policy ws_activity_select on activity_log for select
  using (workspace_id in (select my_workspace_ids()));
drop policy if exists ws_activity_insert on activity_log;
create policy ws_activity_insert on activity_log for insert
  with check (workspace_id in (select my_workspace_ids()));


-- =====================================================================
-- 005_finance.sql
-- =====================================================================

-- 005: Finance. Documents link to projects; payment schedules per project;
-- payments against invoices; derived balance/status views. Safe to re-run.

alter table invoices
  add column if not exists project_id uuid references projects(id) on delete set null,
  add column if not exists due_date date,
  add column if not exists voided_at timestamptz;
create index if not exists idx_invoices_project on invoices(project_id);

create table if not exists payment_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  seq int not null,
  label text not null,
  percent numeric,
  amount numeric,
  due_date date,
  milestone_id uuid references milestones(id) on delete set null,
  invoice_id uuid unique references invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, seq),
  check (percent is not null or amount is not null)
);
create index if not exists idx_schedules_project on payment_schedules(project_id, seq);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount numeric not null check (amount > 0),
  paid_on date not null default current_date,
  method text not null default 'bank_transfer'
    check (method in ('bank_transfer', 'duitnow', 'cash', 'cheque', 'card', 'other')),
  reference text,
  note text,
  receipt_id uuid references invoices(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_invoice on payments(invoice_id);

-- Money view. security_invoker so the caller's RLS applies.
create or replace view invoice_balances with (security_invoker = true) as
with totals as (
  select i.id, i.workspace_id, i.project_id, i.client_id, i.doc_type, i.invoice_no,
         i.bill_to_name, i.invoice_date, i.due_date, i.voided_at,
         round((coalesce(s.subtotal, 0) * (1 + i.sales_tax_rate / 100.0)) - i.discount, 2) as total
  from invoices i
  left join (
    select invoice_id, sum(line_total) as subtotal from invoice_items group by invoice_id
  ) s on s.invoice_id = i.id
),
paid as (
  select invoice_id, sum(amount) as paid_total, max(paid_on) as last_paid_on
  from payments group by invoice_id
)
select t.*,
       coalesce(p.paid_total, 0) as paid_total,
       t.total - coalesce(p.paid_total, 0) as balance,
       p.last_paid_on,
       case
         when t.doc_type <> 'invoice' then null
         when t.voided_at is not null then 'void'
         when coalesce(p.paid_total, 0) >= t.total and t.total > 0 then 'paid'
         when coalesce(p.paid_total, 0) > 0 then 'partial'
         when t.due_date is not null and t.due_date < current_date then 'overdue'
         else 'unpaid'
       end as status
from totals t
left join paid p on p.invoice_id = t.id;

create or replace view project_schedule_view with (security_invoker = true) as
select s.*,
       coalesce(s.amount, round(pr.contract_value * s.percent / 100.0, 2)) as expected_amount,
       b.invoice_no,
       b.status as invoice_status,
       b.paid_total,
       b.total as invoice_total
from payment_schedules s
join projects pr on pr.id = s.project_id
left join invoice_balances b on b.id = s.invoice_id;

-- Activity: payment recorded.
create or replace function log_payment_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_no text;
begin
  select project_id, invoice_no into v_project, v_no from invoices where id = new.invoice_id;
  insert into activity_log (workspace_id, actor_id, entity_type, entity_id, project_id, action, data)
  values (new.workspace_id, auth.uid(), 'payment', new.id, v_project, 'payment_recorded',
          jsonb_build_object('invoice_no', v_no, 'amount', new.amount, 'method', new.method));
  return new;
end;
$$;
drop trigger if exists trg_payments_log on payments;
create trigger trg_payments_log after insert on payments
  for each row execute function log_payment_activity();

-- RLS
alter table payment_schedules enable row level security;
alter table payments enable row level security;

drop policy if exists ws_payment_schedules on payment_schedules;
create policy ws_payment_schedules on payment_schedules for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));

drop policy if exists ws_payments on payments;
create policy ws_payments on payments for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));


-- =====================================================================
-- 006_time_content.sql
-- =====================================================================

-- 006: Time tracking and content calendar. Safe to re-run.

create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_min int generated always as (
    case when ended_at is null then null
         else (extract(epoch from (ended_at - started_at)) / 60)::int end
  ) stored,
  note text,
  billable boolean not null default true,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
-- One running timer per person.
create unique index if not exists one_running_timer_per_user on time_entries(user_id) where ended_at is null;
create index if not exists idx_time_ws_user_start on time_entries(workspace_id, user_id, started_at desc);
create index if not exists idx_time_project on time_entries(project_id, started_at desc);
create index if not exists idx_time_task on time_entries(task_id);

create table if not exists content_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  title text not null,
  channel text not null default 'instagram'
    check (channel in ('instagram', 'facebook', 'tiktok', 'xiaohongshu', 'linkedin', 'youtube', 'website', 'google_ads', 'email', 'press', 'other')),
  format text not null default 'post'
    check (format in ('post', 'reel', 'story', 'carousel', 'article', 'ad', 'video', 'kol', 'other')),
  status text not null default 'idea'
    check (status in ('idea', 'drafting', 'review', 'approved', 'scheduled', 'published', 'cancelled')),
  due_date date not null,
  publish_at timestamptz,
  assignee_id uuid references profiles(id) on delete set null,
  caption text,
  asset_url text,
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_content_ws_due on content_items(workspace_id, due_date);
create index if not exists idx_content_project on content_items(project_id, due_date);
drop trigger if exists trg_content_updated on content_items;
create trigger trg_content_updated before update on content_items
  for each row execute function set_updated_at();

-- RLS. Time: everyone in the workspace can read; you write your own entries
-- (admins may fix anyone's).
alter table time_entries enable row level security;
alter table content_items enable row level security;

drop policy if exists time_select on time_entries;
create policy time_select on time_entries for select
  using (workspace_id in (select my_workspace_ids()));
drop policy if exists time_insert on time_entries;
create policy time_insert on time_entries for insert
  with check (user_id = auth.uid() and workspace_id in (select my_workspace_ids()));
drop policy if exists time_update on time_entries;
create policy time_update on time_entries for update
  using (user_id = auth.uid() or is_workspace_admin(workspace_id))
  with check (user_id = auth.uid() or is_workspace_admin(workspace_id));
drop policy if exists time_delete on time_entries;
create policy time_delete on time_entries for delete
  using (user_id = auth.uid() or is_workspace_admin(workspace_id));

drop policy if exists ws_content_items on content_items;
create policy ws_content_items on content_items for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));


-- =====================================================================
-- 007_ai.sql
-- =====================================================================

-- 007: AI run log. No AI features ship in v1; this table and the /api/ai
-- route are the hooks for later (brief -> tasks, weekly client summary).
-- Safe to re-run.

create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default default_workspace_id() references workspaces(id) on delete cascade,
  user_id uuid default auth.uid() references profiles(id) on delete set null,
  feature text not null,
  project_id uuid references projects(id) on delete set null,
  model text,
  status text not null default 'pending' check (status in ('pending', 'ok', 'error')),
  input jsonb not null default '{}',
  output jsonb,
  error text,
  tokens_in int,
  tokens_out int,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_ai_runs_ws on ai_runs(workspace_id, created_at desc);

alter table ai_runs enable row level security;
drop policy if exists ws_ai_runs on ai_runs;
create policy ws_ai_runs on ai_runs for all
  using (workspace_id in (select my_workspace_ids()))
  with check (workspace_id in (select my_workspace_ids()));
