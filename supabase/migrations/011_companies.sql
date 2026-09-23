-- 011: Several companies in one Hub. Each company is a workspace with its own
-- clients, documents, projects, expenses and bank statements. Someone who
-- belongs to more than one company picks the one they are working in; every RLS
-- policy then sees only that company, because my_workspace_ids() now returns
-- the active company alone. Also adds each company's letterhead and invoice
-- number series, and lets any number series be used, not only EVIV/ZMIV.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Letterhead and number series per company
-- ---------------------------------------------------------------------------
-- profile = { company: { name, regNo, address, tel, email, contact },
--             series: [{ key, label, receiptPrefix, quotationPrefix,
--                        bankName, bankAccount, specialNotes, color }] }
alter table workspaces add column if not exists profile jsonb not null default '{}'::jsonb;

update workspaces
set profile = jsonb_build_object(
  'company', jsonb_build_object(
    'name', 'Zneration Media M Sdn Bhd',
    'regNo', '202401048026 (1593871-M)',
    'address', '21D Faber Plaza Business Centre, Jalan Desa Jaya, Taman Desa, Malaysia, KL, 58100',
    'tel', '012-5417233',
    'email', 'znerationmedia@gmail.com',
    'contact', 'Zac'
  ),
  'series', jsonb_build_array(
    jsonb_build_object(
      'key', 'EVIV', 'label', 'Event Invoice', 'receiptPrefix', 'EVRC', 'quotationPrefix', 'EVQT',
      'bankName', 'PBB', 'bankAccount', '3243091730',
      'specialNotes', 'Upon cancellation of event, fees will be refunded fully.', 'color', 'amber'
    ),
    jsonb_build_object(
      'key', 'ZMIV', 'label', 'Other Invoice (Marketing / AI)', 'receiptPrefix', 'ZMRC', 'quotationPrefix', 'ZMQT',
      'bankName', 'UOB', 'bankAccount', '9113012893', 'specialNotes', '', 'color', 'sky'
    )
  )
)
where profile = '{}'::jsonb and name ilike 'Zneration%';

-- Number series were limited to EVIV/ZMIV (and their receipt/quotation series).
-- Any short upper-case code is allowed now; each company lists its own.
do $$
declare r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('invoices'::regclass, 'clients'::regclass, 'invoice_counters'::regclass)
      and pg_get_constraintdef(oid) like '%EVIV%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table invoices drop constraint if exists invoices_category_format;
alter table invoices add constraint invoices_category_format check (category ~ '^[A-Z][A-Z0-9]{1,7}$');
alter table clients drop constraint if exists clients_default_category_format;
alter table clients add constraint clients_default_category_format
  check (default_category is null or default_category ~ '^[A-Z][A-Z0-9]{1,7}$');
alter table invoice_counters drop constraint if exists invoice_counters_category_format;
alter table invoice_counters add constraint invoice_counters_category_format check (category ~ '^[A-Z][A-Z0-9]{1,7}$');

-- ---------------------------------------------------------------------------
-- 2. The company each person is working in
-- ---------------------------------------------------------------------------
create table if not exists user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_workspace_id uuid references workspaces(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table user_preferences enable row level security;
drop policy if exists prefs_self on user_preferences;
create policy prefs_self on user_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The chosen company if the caller still belongs to it, else their first one.
create or replace function active_workspace_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.active_workspace_id
       from user_preferences p
       join workspace_members m on m.workspace_id = p.active_workspace_id and m.user_id = p.user_id
      where p.user_id = auth.uid()),
    (select workspace_id from workspace_members where user_id = auth.uid() order by created_at limit 1)
  )
$$;

-- Every workspace policy goes through these two, so switching company switches
-- everything the app can see and where new rows are saved.
create or replace function my_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select a.id from (select active_workspace_id() as id) a where a.id is not null
$$;

create or replace function default_workspace_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select active_workspace_id()
$$;

-- All companies the caller belongs to, for the company switcher.
create or replace function my_workspaces()
returns table (
  id uuid, name text, slug text, created_by uuid, created_at timestamptz,
  role text, profile jsonb, is_active boolean
)
language sql stable security definer set search_path = public as $$
  select w.id, w.name, w.slug, w.created_by, w.created_at, m.role, w.profile, w.id = active_workspace_id()
  from workspace_members m
  join workspaces w on w.id = m.workspace_id
  where m.user_id = auth.uid()
  order by m.created_at, w.name
$$;

create or replace function set_active_workspace(p_workspace uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if not exists (select 1 from workspace_members where workspace_id = p_workspace and user_id = auth.uid()) then
    raise exception 'You are not a member of that company.';
  end if;
  insert into user_preferences (user_id, active_workspace_id, updated_at)
  values (auth.uid(), p_workspace, now())
  on conflict (user_id) do update
    set active_workspace_id = excluded.active_workspace_id, updated_at = now();
end;
$$;

-- Adds a company with the caller as its admin. Only admins of an existing
-- company can add one.
create or replace function create_workspace(p_name text, p_profile jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if not exists (select 1 from workspace_members where user_id = auth.uid() and role = 'admin') then
    raise exception 'Only admins can add a company.';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Company name is required.';
  end if;
  insert into workspaces (name, created_by, profile)
  values (btrim(p_name), auth.uid(), coalesce(p_profile, '{}'::jsonb))
  returning id into v_id;
  insert into workspace_members (workspace_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end;
$$;

revoke execute on function set_active_workspace(uuid) from public, anon;
revoke execute on function create_workspace(text, jsonb) from public, anon;
grant execute on function set_active_workspace(uuid) to authenticated;
grant execute on function create_workspace(text, jsonb) to authenticated;
