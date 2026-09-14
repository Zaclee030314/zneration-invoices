-- 008: Payment slips and refunds. Adds a private "attachments" storage bucket
-- (payment slips first; supplier invoices / agreements later), a link from
-- payments to their slip, and refunds recorded as payments of kind 'refund'.
-- Safe to re-run.
--
-- Objects are stored as {workspace_id}/{area}/{record_id}/{file}; the storage
-- policies use that first folder to limit access to members of the workspace.
-- Files are never public: the app opens them through short-lived signed URLs.

-- ---------------------------------------------------------------------------
-- 1. Payments: slip link and refunds
-- ---------------------------------------------------------------------------
alter table payments add column if not exists slip_path text;
alter table payments add column if not exists kind text not null default 'payment';
alter table payments drop constraint if exists payments_kind_check;
alter table payments add constraint payments_kind_check check (kind in ('payment', 'refund'));

-- Refunds count against what has been paid. Same columns as in 005.
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
  select invoice_id,
         sum(case when kind = 'refund' then -amount else amount end) as paid_total,
         max(paid_on) filter (where kind = 'payment') as last_paid_on
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

create or replace function log_payment_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_project uuid; v_no text;
begin
  select project_id, invoice_no into v_project, v_no from invoices where id = new.invoice_id;
  insert into activity_log (workspace_id, actor_id, entity_type, entity_id, project_id, action, data)
  values (new.workspace_id, auth.uid(), 'payment', new.id, v_project,
          case when new.kind = 'refund' then 'refund_recorded' else 'payment_recorded' end,
          jsonb_build_object('invoice_no', v_no, 'amount', new.amount, 'method', new.method, 'kind', new.kind));
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Storage bucket for attachments
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists attachments_select on storage.objects;
create policy attachments_select on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] in (select ws::text from my_workspace_ids() as ws)
  );

drop policy if exists attachments_insert on storage.objects;
create policy attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] in (select ws::text from my_workspace_ids() as ws)
  );

drop policy if exists attachments_update on storage.objects;
create policy attachments_update on storage.objects for update to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] in (select ws::text from my_workspace_ids() as ws)
  )
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] in (select ws::text from my_workspace_ids() as ws)
  );

drop policy if exists attachments_delete on storage.objects;
create policy attachments_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] in (select ws::text from my_workspace_ids() as ws)
  );
