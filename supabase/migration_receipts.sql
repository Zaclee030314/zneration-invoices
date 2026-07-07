-- Migration: add receipts support to an existing database.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. Mark existing rows as invoices and allow receipts going forward.
alter table invoices add column if not exists doc_type text not null default 'invoice';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_doc_type_check') then
    alter table invoices add constraint invoices_doc_type_check check (doc_type in ('invoice', 'receipt'));
  end if;
end $$;

-- 2. Let the counter table hold the receipt number-series (EVRC / ZMRC),
--    not just the invoice ones (EVIV / ZMIV).
alter table invoice_counters drop constraint if exists invoice_counters_category_check;
alter table invoice_counters
  add constraint invoice_counters_category_check
  check (category in ('EVIV', 'ZMIV', 'EVRC', 'ZMRC'));
