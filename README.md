# Zneration Invoices

Invoice generator for **Zneration Media M Sdn Bhd**, replacing the old Excel +
Python-script workflow. Auto-numbers, stores, and exports invoices under two
categories:

- **EVIV** — Event invoices (booth rentals, bazaars, markets)
- **ZMIV** — Other invoices (marketing / AI retainers)

## Stack
- Next.js 14 (App Router, TypeScript)
- Supabase (Postgres + Auth)
- Tailwind CSS
- `@react-pdf/renderer` for branded PDF generation (no headless Chromium needed)
- `jszip` for bulk PDF export

## One-time setup

### 1. Install
```bash
npm install
```

### 2. Create a Supabase project
Go to https://supabase.com → New project. Copy the **Project URL** and **anon key**
from Settings → API.

### 3. Configure env
Copy `.env.local.example` → `.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 4. Create the schema
In Supabase → SQL Editor, paste & run the contents of `supabase/schema.sql`.
This creates `clients`, `invoices`, `invoice_items`, `invoice_counters`, the
`next_invoice_no()` numbering function, and Row Level Security policies that
restrict all data to your own account.

### 5. Run locally
```bash
npm run dev
```
Open http://localhost:3000, click **Sign in → Create account** to make your
owner login, then **+ New Invoice**.

## How invoice numbering works
Each invoice gets `{PREFIX}{YY}{MM}-{seq}`, e.g. `EVIV2607-04` or `ZMIV2607-01`.
The sequence resets every month, per category, and is assigned atomically on
save via the `next_invoice_no()` Postgres function — the number shown while
editing is only a preview.

## Category defaults
Picking EVIV or ZMIV on the invoice form auto-fills the bank account and
special notes (editable per invoice):
- **EVIV** → PBB `3243091730`, includes the event cancellation/refund note
- **ZMIV** → UOB `9113012893`

## Exports
- **PDF** — per-invoice, styled to match the original branded template.
- **ZIP** — select multiple invoices on the dashboard → Export ZIP.
- **CSV** — respects the dashboard's current filters (category/date/search) →
  Export CSV, opens cleanly in Excel.

## Deploy to Vercel
1. Push this repo to GitHub.
2. Import in Vercel → set the two `NEXT_PUBLIC_*` env vars → deploy.

## Data model
- `clients` — reusable directory (name, reg no., address, default category)
- `invoices` — one row per invoice, snapshots the Bill To details at creation
  time so later edits to a client don't rewrite historical invoices
- `invoice_items` — line items per invoice (amount is optional, so you can add
  unpriced description bullets like the current marketing invoices do)
- `invoice_counters` — backs the atomic per-category-per-month numbering

Row-Level Security restricts every row to its owner — only you see your data.
