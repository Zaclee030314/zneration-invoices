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
