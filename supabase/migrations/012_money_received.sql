-- 012: Money received. Each payment recorded on an invoice can point at the
-- bank line it arrived in, so a bank credit shows which invoices it paid and an
-- invoice shows which bank line paid it. Credits that are not invoice payments
-- (transfers between own accounts, loans, refunds, product sales) are marked by
-- category or explanation instead. Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Link payments to bank lines
-- ---------------------------------------------------------------------------
alter table payments add column if not exists bank_transaction_id uuid references bank_transactions(id) on delete set null;
create index if not exists idx_payments_bank_txn on payments(bank_transaction_id) where bank_transaction_id is not null;

-- A payment links to money received, a refund to money paid out, both in the
-- same company, and the payments on one bank line never add up to more than it.
create or replace function check_payment_bank_link()
returns trigger language plpgsql as $$
declare
  v_txn bank_transactions%rowtype;
  v_linked numeric;
begin
  if new.bank_transaction_id is null then
    return new;
  end if;
  select * into v_txn from bank_transactions where id = new.bank_transaction_id for update;
  if not found then
    raise exception 'That bank line was not found.';
  end if;
  if v_txn.workspace_id <> new.workspace_id then
    raise exception 'That bank line belongs to another company.';
  end if;
  if (coalesce(new.kind, 'payment') = 'refund') <> (v_txn.direction = 'out') then
    raise exception 'Payments link to money received, and refunds to money paid out.';
  end if;
  select coalesce(sum(amount), 0) into v_linked
  from payments
  where bank_transaction_id = new.bank_transaction_id and id <> new.id;
  if v_linked + new.amount > v_txn.amount + 0.005 then
    raise exception 'The bank line is RM % and RM % of it is already linked, so RM % does not fit.',
      v_txn.amount, v_linked, new.amount;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payments_bank_link on payments;
create trigger trg_payments_bank_link before insert or update of bank_transaction_id, amount, kind on payments
  for each row execute function check_payment_bank_link();

-- Links several recorded payments to bank lines in one go (used by "Match recorded
-- payments"). All or nothing; the trigger above checks each link.
create or replace function link_bank_payments(p_links jsonb)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count int;
begin
  update payments p
     set bank_transaction_id = (l->>'bank_transaction_id')::uuid
    from jsonb_array_elements(p_links) l
   where p.id = (l->>'payment_id')::uuid
     and p.bank_transaction_id is null;
  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_links) then
    raise exception 'Some payments were already linked or not found (% of %), so nothing was linked.', v_count, jsonb_array_length(p_links);
  end if;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Categories: product sales for money received without an invoice
-- ---------------------------------------------------------------------------
alter table bank_transactions drop constraint if exists bank_transactions_category_check;
alter table bank_transactions add constraint bank_transactions_category_check check (
  category is null or category in (
    'advertising', 'event_costs', 'contractors', 'salary', 'staff_claim', 'rental', 'software',
    'purchases', 'transport', 'meals', 'professional_fees', 'tax_statutory', 'bank_charges',
    'refund', 'loan_advance', 'own_transfer', 'other', 'customer_payment', 'product_sales', 'other_income'
  )
);

-- Money already imported that clearly is not an invoice payment gets the same
-- first guess new imports now make (the team can change it).
update bank_transactions
   set category = 'loan_advance', category_source = 'auto'
 where direction = 'in' and category is null
   and upper(description) ~ '(BORROW|\mLOAN\M|ADVANCE|PINJAM)';
update bank_transactions
   set category = 'refund', category_source = 'auto'
 where direction = 'in' and category is null
   and upper(description) ~ '\mREFUND';

-- ---------------------------------------------------------------------------
-- 3. Status of money received
-- ---------------------------------------------------------------------------
-- Money out keeps done / needs_attention. Money in is
--   matched    fully linked to invoice payments (or partly, with an explanation)
--   partial    partly linked
--   no_invoice not an invoice payment: own transfer, loan, refund, product sales,
--              other income, zero amount or explained
--   unmatched  still to be linked
create or replace view bank_transactions_view with (security_invoker = true) as
select t.*,
       a.bank,
       a.account_no,
       coalesce(nullif(btrim(a.label), ''), a.bank || ' ' || right(a.account_no, 4)) as account_label,
       p.code as project_code,
       p.name as project_name,
       p.kind as project_kind,
       coalesce(d.doc_count, 0) as doc_count,
       case
         when t.direction = 'out' then
           case
             when coalesce(d.doc_count, 0) > 0
                  or nullif(btrim(coalesce(t.explanation, '')), '') is not null
                  or t.category = 'own_transfer'
                  or t.amount = 0 then 'done'
             else 'needs_attention'
           end
         when coalesce(l.linked_total, 0) > 0
              and (coalesce(l.linked_total, 0) >= t.amount - 0.005
                   or nullif(btrim(coalesce(t.explanation, '')), '') is not null) then 'matched'
         when coalesce(l.linked_total, 0) > 0 then 'partial'
         when t.amount = 0
              or t.category in ('own_transfer', 'loan_advance', 'refund', 'product_sales', 'other_income')
              or nullif(btrim(coalesce(t.explanation, '')), '') is not null then 'no_invoice'
         else 'unmatched'
       end as status,
       case
         when t.direction <> 'out' then null
         when coalesce(d.doc_count, 0) > 0 then 'documents'
         when nullif(btrim(coalesce(t.explanation, '')), '') is not null then 'explanation'
         when t.category = 'own_transfer' then 'own_transfer'
         when t.amount = 0 then 'zero_amount'
       end as done_reason,
       coalesce(l.linked_total, 0) as linked_total,
       coalesce(l.linked_count, 0) as linked_count
from bank_transactions t
join bank_accounts a on a.id = t.account_id
left join projects p on p.id = t.project_id
left join (
  select transaction_id, count(*)::int as doc_count from expense_documents group by transaction_id
) d on d.transaction_id = t.id
left join (
  select bank_transaction_id, sum(amount) as linked_total, count(*)::int as linked_count
  from payments
  where bank_transaction_id is not null
  group by bank_transaction_id
) l on l.bank_transaction_id = t.id;

-- ---------------------------------------------------------------------------
-- 4. Deleting a statement keeps invoice links safe
-- ---------------------------------------------------------------------------
-- Same as 010, and also refuses while a bank line that would be removed is
-- linked to an invoice payment.
create or replace function delete_bank_statement(p_statement uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_path text;
  v_kept int;
  v_blocked int;
  v_linked int;
  v_deleted int;
begin
  select file_path into v_path from bank_statements where id = p_statement;
  if not found then
    raise exception 'Statement not found.';
  end if;

  with moved as (
    update bank_transactions t
       set statement_id = (
         select o.id from bank_statements o
         where o.account_id = t.account_id and o.id <> p_statement
           and t.posted_on between o.period_start and o.period_end
         order by o.created_at
         limit 1
       )
     where t.statement_id = p_statement
       and exists (
         select 1 from bank_statements o
         where o.account_id = t.account_id and o.id <> p_statement
           and t.posted_on between o.period_start and o.period_end
       )
    returning 1
  )
  select count(*) into v_kept from moved;

  select count(distinct d.transaction_id) into v_blocked
  from expense_documents d
  join bank_transactions t on t.id = d.transaction_id
  where t.statement_id = p_statement;
  if v_blocked > 0 then
    raise exception '% payment(s) from this statement have documents attached. Remove those documents first.', v_blocked;
  end if;

  select count(distinct py.bank_transaction_id) into v_linked
  from payments py
  join bank_transactions t on t.id = py.bank_transaction_id
  where t.statement_id = p_statement;
  if v_linked > 0 then
    raise exception '% bank line(s) from this statement are linked to invoice payments. Unlink them on Money received first.', v_linked;
  end if;

  delete from bank_transactions where statement_id = p_statement;
  get diagnostics v_deleted = row_count;
  delete from bank_statements where id = p_statement;

  return jsonb_build_object('file_path', v_path, 'deleted', v_deleted, 'kept', v_kept);
end;
$$;
