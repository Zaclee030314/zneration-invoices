-- Migration: add quotations support to an existing database.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. Allow doc_type = 'quotation' alongside invoice/receipt.
alter table invoices drop constraint if exists invoices_doc_type_check;
alter table invoices
  add constraint invoices_doc_type_check
  check (doc_type in ('invoice', 'receipt', 'quotation'));

-- 2. Let the counter table hold the quotation number-series (EVQT / ZMQT).
alter table invoice_counters drop constraint if exists invoice_counters_category_check;
alter table invoice_counters
  add constraint invoice_counters_category_check
  check (category in ('EVIV', 'ZMIV', 'EVRC', 'ZMRC', 'EVQT', 'ZMQT'));
