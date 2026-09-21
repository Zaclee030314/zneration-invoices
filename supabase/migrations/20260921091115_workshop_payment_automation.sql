-- Creates a ZMIV invoice, records a workshop payment, and creates its ZMRC
-- receipt atomically. Only the server-side service role may call the RPC.

create table if not exists workshop_payment_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  external_id text not null,
  source text not null default 'whatsapp',
  whatsapp_jid text not null,
  payload jsonb not null default '{}'::jsonb,
  invoice_id uuid not null references invoices(id) on delete restrict,
  payment_id uuid not null references payments(id) on delete restrict,
  receipt_id uuid not null references invoices(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (workspace_id, source, external_id)
);

alter table workshop_payment_events enable row level security;
revoke all on table workshop_payment_events from anon, authenticated;

create or replace function create_workshop_payment_documents(
  p_workspace_id uuid,
  p_external_id text,
  p_whatsapp_jid text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_session text,
  p_amount numeric,
  p_paid_on date,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing workshop_payment_events%rowtype;
  v_owner uuid;
  v_client uuid;
  v_invoice uuid;
  v_payment uuid;
  v_receipt uuid;
  v_invoice_seq int;
  v_receipt_seq int;
  v_invoice_no text;
  v_receipt_no text;
  v_yymm text := to_char(p_paid_on, 'YYMM');
  v_description text;
begin
  if p_external_id is null or length(trim(p_external_id)) < 3 then
    raise exception 'external_id is required';
  end if;
  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'customer_name is required';
  end if;
  if p_session not in ('penang', 'kl') then
    raise exception 'session must be penang or kl';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000 then
    raise exception 'amount is outside the accepted range';
  end if;

  -- Serializes retries for the same WhatsApp payment without locking unrelated work.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_external_id, 0));

  select * into v_existing
  from workshop_payment_events
  where workspace_id = p_workspace_id
    and source = 'whatsapp'
    and external_id = p_external_id;

  if found then
    return jsonb_build_object(
      'invoiceId', v_existing.invoice_id,
      'invoiceNo', (select invoice_no from invoices where id = v_existing.invoice_id),
      'paymentId', v_existing.payment_id,
      'receiptId', v_existing.receipt_id,
      'receiptNo', (select invoice_no from invoices where id = v_existing.receipt_id),
      'duplicate', true
    );
  end if;

  select coalesce(
    w.created_by,
    (select wm.user_id from workspace_members wm
     where wm.workspace_id = w.id
     order by (wm.role = 'admin') desc, wm.created_at
     limit 1)
  ) into v_owner
  from workspaces w
  where w.id = p_workspace_id;

  if v_owner is null then
    raise exception 'workspace has no document owner';
  end if;

  select c.id into v_client
  from clients c
  where c.workspace_id = p_workspace_id
    and (
      (p_customer_phone is not null and p_customer_phone <> '' and
       regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = regexp_replace(p_customer_phone, '\D', '', 'g'))
      or
      (p_customer_email is not null and p_customer_email <> '' and lower(c.email) = lower(p_customer_email))
    )
  order by c.created_at
  limit 1;

  if v_client is null then
    insert into clients (
      owner_id, workspace_id, name, default_category, status,
      email, phone, source, notes
    ) values (
      v_owner, p_workspace_id, trim(p_customer_name), 'ZMIV', 'active',
      nullif(trim(coalesce(p_customer_email, '')), ''),
      nullif(trim(coalesce(p_customer_phone, '')), ''),
      'WhatsApp AI workshop',
      'Created automatically after workshop payment evidence was submitted.'
    ) returning id into v_client;
  end if;

  insert into invoice_counters (workspace_id, category, yymm, last_seq)
  values (p_workspace_id, 'ZMIV', v_yymm, 1)
  on conflict (workspace_id, category, yymm)
  do update set last_seq = invoice_counters.last_seq + 1
  returning last_seq into v_invoice_seq;
  v_invoice_no := 'ZMIV' || v_yymm || '-' || lpad(v_invoice_seq::text, 2, '0');

  insert into invoice_counters (workspace_id, category, yymm, last_seq)
  values (p_workspace_id, 'ZMRC', v_yymm, 1)
  on conflict (workspace_id, category, yymm)
  do update set last_seq = invoice_counters.last_seq + 1
  returning last_seq into v_receipt_seq;
  v_receipt_no := 'ZMRC' || v_yymm || '-' || lpad(v_receipt_seq::text, 2, '0');

  v_description := 'AI Make More Workshop - ' ||
    case when p_session = 'penang' then 'Penang, 10 October 2026' else 'KL, 24 October 2026' end;

  insert into invoices (
    owner_id, workspace_id, invoice_no, doc_type, category, client_id,
    bill_to_name, invoice_date, due_date, bank_name, bank_account,
    sales_tax_rate, discount, special_notes
  ) values (
    v_owner, p_workspace_id, v_invoice_no, 'invoice', 'ZMIV', v_client,
    trim(p_customer_name), p_paid_on, p_paid_on, 'UOB', '9113012893',
    0, 0, 'Paid via DuitNow. Generated from the WhatsApp workshop registration flow.'
  ) returning id into v_invoice;

  insert into invoice_items (invoice_id, description, line_total, sort_order)
  values (v_invoice, v_description, round(p_amount, 2), 0);

  insert into invoices (
    owner_id, workspace_id, invoice_no, doc_type, category, client_id,
    bill_to_name, invoice_date, due_date, bank_name, bank_account,
    sales_tax_rate, discount, special_notes
  ) values (
    v_owner, p_workspace_id, v_receipt_no, 'receipt', 'ZMIV', v_client,
    trim(p_customer_name), p_paid_on, null, 'UOB', '9113012893',
    0, 0, 'Payment received via DuitNow.'
  ) returning id into v_receipt;

  insert into invoice_items (invoice_id, description, line_total, sort_order)
  values (v_receipt, v_description, round(p_amount, 2), 0);

  insert into payments (
    workspace_id, invoice_id, kind, amount, paid_on, method,
    reference, note, receipt_id, created_by
  ) values (
    p_workspace_id, v_invoice, 'payment', round(p_amount, 2), p_paid_on, 'duitnow',
    nullif(trim(coalesce(p_reference, '')), ''),
    'Created from WhatsApp workshop payment flow.', v_receipt, v_owner
  ) returning id into v_payment;

  insert into workshop_payment_events (
    workspace_id, external_id, source, whatsapp_jid, payload,
    invoice_id, payment_id, receipt_id
  ) values (
    p_workspace_id, trim(p_external_id), 'whatsapp', p_whatsapp_jid,
    jsonb_build_object(
      'customerName', trim(p_customer_name),
      'customerPhone', p_customer_phone,
      'customerEmail', p_customer_email,
      'session', p_session,
      'amount', round(p_amount, 2),
      'paidOn', p_paid_on,
      'reference', p_reference
    ),
    v_invoice, v_payment, v_receipt
  );

  return jsonb_build_object(
    'invoiceId', v_invoice,
    'invoiceNo', v_invoice_no,
    'paymentId', v_payment,
    'receiptId', v_receipt,
    'receiptNo', v_receipt_no,
    'duplicate', false
  );
end;
$$;

revoke all on function create_workshop_payment_documents(
  uuid, text, text, text, text, text, text, numeric, date, text
) from public, anon, authenticated;
grant execute on function create_workshop_payment_documents(
  uuid, text, text, text, text, text, text, numeric, date, text
) to service_role;
