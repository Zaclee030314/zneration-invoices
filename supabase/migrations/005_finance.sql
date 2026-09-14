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
