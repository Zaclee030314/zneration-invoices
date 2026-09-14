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
