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
