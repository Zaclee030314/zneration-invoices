-- 009: Refunded status. When an invoice's refunds cancel out everything that
-- was paid (the job stopped and the client got their money back), the invoice
-- is closed: status 'refunded' and nothing owed. A partial refund still leaves
-- a balance. Requires 008. Safe to re-run.

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
         coalesce(sum(amount) filter (where kind = 'refund'), 0) as refunded_total,
         max(paid_on) filter (where kind = 'payment') as last_paid_on
  from payments group by invoice_id
),
balances as (
  select t.*,
         coalesce(p.paid_total, 0) as paid_total,
         coalesce(p.refunded_total, 0) > 0 and coalesce(p.paid_total, 0) <= 0 as fully_refunded,
         p.last_paid_on
  from totals t
  left join paid p on p.invoice_id = t.id
)
select b.id, b.workspace_id, b.project_id, b.client_id, b.doc_type, b.invoice_no,
       b.bill_to_name, b.invoice_date, b.due_date, b.voided_at, b.total,
       b.paid_total,
       case when b.fully_refunded then 0 else b.total - b.paid_total end as balance,
       b.last_paid_on,
       case
         when b.doc_type <> 'invoice' then null
         when b.voided_at is not null then 'void'
         when b.fully_refunded then 'refunded'
         when b.paid_total >= b.total and b.total > 0 then 'paid'
         when b.paid_total > 0 then 'partial'
         when b.due_date is not null and b.due_date < current_date then 'overdue'
         else 'unpaid'
       end as status
from balances b;
