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
