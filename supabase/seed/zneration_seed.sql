-- Zneration Media seed: the real engagements as of September 2026.
--
-- Run in the Supabase SQL editor AFTER migrations 000-007 and after Zac has
-- signed in at least once (so the workspace + profile exist). Idempotent:
-- re-running updates nothing and adds nothing that already exists.
-- Contains no credentials, bank details or keys.

-- Session-scoped helper functions (pg_temp vanishes when the session ends).
create or replace function pg_temp.ensure_client(
  p_ws uuid, p_owner uuid, p_name text, p_status text, p_industry text, p_category text default 'ZMIV'
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from clients where workspace_id = p_ws and lower(name) = lower(p_name) limit 1;
  if v_id is null then
    insert into clients (workspace_id, owner_id, name, status, industry, default_category)
    values (p_ws, p_owner, p_name, p_status, p_industry, p_category)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function pg_temp.ensure_project(
  p_ws uuid, p_client uuid, p_code text, p_name text, p_kind text, p_stage text,
  p_health text, p_lead uuid, p_description text default null, p_url text default null,
  p_contract numeric default null, p_start date default null, p_due date default null
) returns uuid language plpgsql as $$
declare v_id uuid; v_pos float8;
begin
  select id into v_id from projects where workspace_id = p_ws and code = p_code;
  if v_id is null then
    select coalesce(max(stage_position), 0) + 1000 into v_pos from projects where workspace_id = p_ws and stage = p_stage;
    insert into projects (workspace_id, client_id, code, name, kind, stage, stage_position, health, lead_user_id,
                          description, url, contract_value, start_date, due_date)
    values (p_ws, p_client, p_code, p_name, p_kind, p_stage, v_pos, p_health, p_lead,
            p_description, p_url, p_contract, p_start, p_due)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function pg_temp.ensure_milestone(
  p_ws uuid, p_project uuid, p_title text, p_status text, p_due date, p_order int
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from milestones where project_id = p_project and title = p_title;
  if v_id is null then
    insert into milestones (workspace_id, project_id, title, status, due_date, sort_order)
    values (p_ws, p_project, p_title, p_status, p_due, p_order)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function pg_temp.ensure_task(
  p_ws uuid, p_project uuid, p_title text, p_status text, p_priority text, p_assignee uuid,
  p_due date default null, p_milestone uuid default null
) returns void language plpgsql as $$
declare v_pos float8;
begin
  if not exists (select 1 from tasks where project_id = p_project and title = p_title) then
    select coalesce(max(position), 0) + 1000 into v_pos from tasks where project_id = p_project and status = p_status;
    insert into tasks (workspace_id, project_id, title, status, priority, assignee_id, due_date, milestone_id, position)
    values (p_ws, p_project, p_title, p_status, p_priority, p_assignee, p_due, p_milestone, v_pos);
  end if;
end $$;

create or replace function pg_temp.ensure_schedule(
  p_ws uuid, p_project uuid, p_seq int, p_label text, p_percent numeric, p_amount numeric default null
) returns void language plpgsql as $$
begin
  if not exists (select 1 from payment_schedules where project_id = p_project and seq = p_seq) then
    insert into payment_schedules (workspace_id, project_id, seq, label, percent, amount)
    values (p_ws, p_project, p_seq, p_label, p_percent, p_amount);
  end if;
end $$;

create or replace function pg_temp.ensure_content(
  p_ws uuid, p_project uuid, p_client uuid, p_title text, p_channel text, p_format text,
  p_status text, p_due date, p_assignee uuid
) returns void language plpgsql as $$
begin
  if not exists (select 1 from content_items where project_id = p_project and title = p_title and due_date = p_due) then
    insert into content_items (workspace_id, project_id, client_id, title, channel, format, status, due_date, assignee_id)
    values (p_ws, p_project, p_client, p_title, p_channel, p_format, p_status, p_due, p_assignee);
  end if;
end $$;

create or replace function pg_temp.ensure_note(p_ws uuid, p_project uuid, p_author uuid, p_body text)
returns void language plpgsql as $$
begin
  if not exists (select 1 from notes where project_id = p_project and body = p_body) then
    insert into notes (workspace_id, project_id, author_id, body) values (p_ws, p_project, p_author, p_body);
  end if;
end $$;

do $$
declare
  v_ws uuid;
  v_zac uuid;
  c_hg uuid; c_hp uuid; c_cfy uuid; c_amh uuid; c_yt uuid; c_petz uuid; c_wc uuid;
  c_aoa uuid; c_bbg uuid; c_pzm uuid; c_zm uuid; c_wdf uuid;
  p uuid; m uuid; q uuid;
  d date;
  i int;
begin
  -- Context ---------------------------------------------------------------
  select id into v_ws from workspaces where name = 'Zneration Media' order by created_at limit 1;
  if v_ws is null then
    raise exception 'Workspace "Zneration Media" not found. Run migration 001 and sign in first.';
  end if;
  select id into v_zac from profiles where lower(email) = 'znerationmedia@gmail.com';
  if v_zac is null then
    select created_by into v_zac from workspaces where id = v_ws;
  end if;
  if v_zac is null then
    raise exception 'No profile found for the workspace owner. Sign in once, then re-run.';
  end if;

  -- Clients ---------------------------------------------------------------
  c_hg   := pg_temp.ensure_client(v_ws, v_zac, 'HG Services (M) Sdn Bhd', 'active', 'Contractor services');
  c_hp   := pg_temp.ensure_client(v_ws, v_zac, 'Helix Point', 'active', 'Procurement');
  c_cfy  := pg_temp.ensure_client(v_ws, v_zac, 'Coforyou', 'active', 'Consumer membership');
  c_amh  := pg_temp.ensure_client(v_ws, v_zac, 'Akshara Music Hub', 'active', 'Music education');
  c_yt   := pg_temp.ensure_client(v_ws, v_zac, 'Ytoday', 'active', 'Creator marketing');
  c_petz := pg_temp.ensure_client(v_ws, v_zac, 'Petz Pawradise', 'active', 'Pet retail & events');
  c_wc   := pg_temp.ensure_client(v_ws, v_zac, 'Wang Cheng Advertising', 'active', 'Advertising');
  c_aoa  := pg_temp.ensure_client(v_ws, v_zac, 'Alive Oneness Academy (M) Sdn Bhd', 'active', 'Education');
  c_bbg  := pg_temp.ensure_client(v_ws, v_zac, 'BBG', 'dormant', 'Personal');
  c_pzm  := pg_temp.ensure_client(v_ws, v_zac, 'PurezenM', 'dormant', 'Consumer products');
  c_zm   := pg_temp.ensure_client(v_ws, v_zac, 'Zneration Media (internal)', 'active', 'Internal');
  c_wdf  := pg_temp.ensure_client(v_ws, v_zac, 'Vinti Global / Northeory Sdn Bhd', 'lead', 'Events', 'EVIV');

  if not exists (select 1 from contacts where client_id = c_hg and name = 'Black Lee') then
    insert into contacts (workspace_id, client_id, name, role, is_primary) values (v_ws, c_hg, 'Black Lee', 'Owner', true);
  end if;

  -- HG Services -----------------------------------------------------------
  p := pg_temp.ensure_project(v_ws, c_hg, 'HG-ERP', 'HG Group Hub ERP', 'software', 'active', 'on_track', v_zac,
        'Operations platform replacing 26 legacy Sheets tools: quotations, job reports, subcon invoices, clock-in, rate cards.',
        'https://hggrouphub.com');
  m := pg_temp.ensure_milestone(v_ws, p, 'Live ops support', 'in_progress', null, 1);
  perform pg_temp.ensure_task(v_ws, p, 'Review handover notes with Black Lee', 'todo', 'medium', v_zac, current_date + 7, m);
  perform pg_temp.ensure_task(v_ws, p, 'Triage bug reports from site staff', 'in_progress', 'high', v_zac, null, m);
  m := pg_temp.ensure_milestone(v_ws, p, 'Round 2 features', 'planned', null, 2);
  perform pg_temp.ensure_task(v_ws, p, 'Scope AI assistant (Jarvis plan)', 'backlog', 'low', v_zac, null, m);

  p := pg_temp.ensure_project(v_ws, c_hg, 'HG-ADS', 'HG marketing: Google Ads', 'marketing', 'active', 'on_track', v_zac,
        'Monthly Google Ads management and reporting.');
  d := date_trunc('month', current_date)::date;
  for i in 0..2 loop
    perform pg_temp.ensure_content(v_ws, p, c_hg, 'Monthly ad set review', 'google_ads', 'ad', 'idea',
      (d + (i || ' month')::interval + interval '1 month' - interval '1 day')::date, v_zac);
  end loop;

  -- Helix Point -----------------------------------------------------------
  p := pg_temp.ensure_project(v_ws, c_hp, 'HP-PD2', 'Procurement Desk v2', 'software', 'active', 'on_track', v_zac,
        'RFQ workflow, quote comparison and supplier scorecards. Roadmap agreed 25 Aug 2026.');
  m := pg_temp.ensure_milestone(v_ws, p, 'Round D1', 'in_progress', null, 1);
  perform pg_temp.ensure_task(v_ws, p, 'Implement D1 feedback items', 'in_progress', 'high', v_zac, current_date + 10, m);
  m := pg_temp.ensure_milestone(v_ws, p, 'Round D2', 'planned', null, 2);
  perform pg_temp.ensure_task(v_ws, p, 'Plan D2 scope with client', 'todo', 'medium', v_zac, null, m);

  -- Coforyou --------------------------------------------------------------
  p := pg_temp.ensure_project(v_ws, c_cfy, 'CFY-MEMBER', 'Coforyou membership site', 'software', 'beta', 'on_track', v_zac,
        'Campaigns, purchase claims, points, prize draws, member portal and back office. Beta live behind basic auth.');
  m := pg_temp.ensure_milestone(v_ws, p, 'Handover', 'planned', null, 1);
  perform pg_temp.ensure_task(v_ws, p, 'Finalise backend handover doc', 'todo', 'medium', v_zac, null, m);

  -- Akshara ---------------------------------------------------------------
  p := pg_temp.ensure_project(v_ws, c_amh, 'AMH-AI', 'Akshara AI music-learning app', 'software', 'active', 'on_track', v_zac,
        'AI music-learning web app with payments, family profiles and admin import/export.');
  m := pg_temp.ensure_milestone(v_ws, p, 'Family profiles & admin tools', 'in_progress', null, 1);
  perform pg_temp.ensure_task(v_ws, p, 'Admin CSV import/export QA', 'review', 'medium', v_zac, null, m);

  -- Ytoday ----------------------------------------------------------------
  p := pg_temp.ensure_project(v_ws, c_yt, 'YT-KOL', 'KOL sourcing + research dashboard', 'marketing', 'active', 'on_track', v_zac,
        'Creator sourcing, campaign ops and the research dashboard.');
  m := pg_temp.ensure_milestone(v_ws, p, 'Monthly creator reports', 'in_progress', null, 1);
  perform pg_temp.ensure_task(v_ws, p, 'Compile monthly KOL report', 'todo', 'medium', v_zac, current_date + 14, m);
  perform pg_temp.ensure_content(v_ws, p, c_yt, 'Creator shortlist: university sponsorship', 'other', 'kol', 'drafting', current_date + 5, v_zac);

  -- Pawradise -------------------------------------------------------------
  p := pg_temp.ensure_project(v_ws, c_petz, 'PETZ-APP', 'Pawradise web app + events', 'software', 'active', 'at_risk', v_zac,
        'E-commerce/community web app plus event marketing support. Activity has slowed; confirm next scope with client.');
  perform pg_temp.ensure_note(v_ws, p, v_zac, 'Semi-active: last app deploy in July, event support continued into August. Confirm whether there is a next phase.');

  -- Wang Cheng ------------------------------------------------------------
  p := pg_temp.ensure_project(v_ws, c_wc, 'WC-WEB', 'Wang Cheng website', 'software', 'done', 'on_track', v_zac,
        'Static Chinese-language marketing site with case-study gallery. Delivered August 2026.');
  p := pg_temp.ensure_project(v_ws, c_wc, 'WC-30DAY', 'Wang Cheng 30-day content plan', 'content', 'active', 'on_track', v_zac,
        'Daily short-form content (drone footage, subtitles) across Instagram, Facebook and Xiaohongshu.');
  m := pg_temp.ensure_milestone(v_ws, p, '30-day plan', 'in_progress', current_date + 29, 1);
  for i in 0..29 loop
    perform pg_temp.ensure_content(v_ws, p, c_wc, 'Day ' || (i + 1) || ' post',
      (array['instagram', 'facebook', 'xiaohongshu'])[(i % 3) + 1],
      (array['reel', 'post', 'video'])[(i % 3) + 1],
      'idea', current_date + i, v_zac);
  end loop;

  -- Alive Oneness Academy -------------------------------------------------
  p := pg_temp.ensure_project(v_ws, c_aoa, 'AOA-SOW1', 'Alive Oneness Academy SOW v1.0', 'software', 'proposal', 'on_track', v_zac,
        'Scope of Work v1.0 and quotation issued September 2026; agreements signed.');
  select id into q from invoices where workspace_id = v_ws and invoice_no = 'ZMQT2609-02' and doc_type = 'quotation' limit 1;
  if q is not null then
    update projects set quotation_id = q where id = p and quotation_id is null;
    update invoices set project_id = p, client_id = coalesce(client_id, c_aoa) where id = q and project_id is null;
  end if;
  perform pg_temp.ensure_task(v_ws, p, 'Confirm kickoff date with Alive', 'todo', 'high', v_zac, current_date + 3);

  -- BBG / PurezenM / internal ---------------------------------------------
  p := pg_temp.ensure_project(v_ws, c_bbg, 'BBG-PET', 'BBG desktop pet', 'software', 'done', 'on_track', v_zac,
        'Python desktop pet app and anniversary content. Delivered 21 Aug 2026.');
  p := pg_temp.ensure_project(v_ws, c_pzm, 'PZM', 'PurezenM product marketing', 'marketing', 'dormant', 'on_track', v_zac,
        'Female-focused product investment case and ads. Dormant since 2025.');
  p := pg_temp.ensure_project(v_ws, c_zm, 'ZAC-IG', 'Zac IG content', 'content', 'active', 'on_track', v_zac,
        'Personal-brand carousels, videos and lead-magnet PDFs.');
  for i in 0..3 loop
    perform pg_temp.ensure_content(v_ws, p, c_zm, 'Weekly carousel', 'instagram', 'carousel', 'idea', current_date + (i * 7), v_zac);
  end loop;

  -- Wish Day Festival 2027 ------------------------------------------------
  p := pg_temp.ensure_project(v_ws, c_wdf, 'WDF-2027', 'Wish Day Festival 2027 (Sabah edition)', 'event', 'proposal', 'on_track', v_zac,
        'Marketing + festival tech platform proposal for 27-28 Mar 2027 at Nexus Resort & Spa Karambunai.',
        null, null, null, '2027-03-27');
  perform pg_temp.ensure_note(v_ws, p, v_zac,
    'Two all-in packages proposed: A "Momentum" RM 230,000 and B "Signature" RM 300,000, both including the festival tech platform (landing page, online wish wall, QR check-in, ticketing). Payment 30/25/25/20 on milestones. Contract value is set once a package is accepted.');
  perform pg_temp.ensure_schedule(v_ws, p, 1, 'Deposit on signing', 30);
  perform pg_temp.ensure_schedule(v_ws, p, 2, 'Platform live + campaign launch', 25);
  perform pg_temp.ensure_schedule(v_ws, p, 3, 'Pre-event milestone', 25);
  perform pg_temp.ensure_schedule(v_ws, p, 4, 'Post-event wrap', 20);
  perform pg_temp.ensure_task(v_ws, p, 'Follow up with Northeory on package decision', 'todo', 'high', v_zac, current_date + 7);

  raise notice 'Seed complete for workspace %', v_ws;
end $$;
