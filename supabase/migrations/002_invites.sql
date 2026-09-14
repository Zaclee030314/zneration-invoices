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
