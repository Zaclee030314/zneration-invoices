# Zneration Hub

Internal project-management system for **Zneration Media (M) Sdn Bhd**, built on
top of the original invoice generator. One login, one workspace shared by the
team, covering:

- **Clients & pipeline** — client directory with contacts and notes; every
  engagement is a *project* that moves through lead → proposal → active → beta →
  handover → done (or dormant / lost) on a drag-and-drop pipeline board.
- **Projects, milestones & tasks** — kanban and list views, priorities,
  assignees, due dates, comments, and an automatic activity log.
- **Quotations, invoices & receipts** — the original generator (EVIV / ZMIV
  number series, branded PDFs, CSV/ZIP export), now linked to projects, with
  payment schedules (e.g. 30/25/25/20), recorded payments and
  unpaid / partial / paid / overdue status.
- **Time tracking** — one-click timer per task, manual logs, weekly and
  per-project totals.
- **Content calendar** — deliverables and posts by channel (Instagram,
  Facebook, TikTok, Xiaohongshu, Google Ads, ...) with status and assignee.
- **AI hooks** — an `ai_runs` table and `/api/ai/<feature>` route are in place
  for later features (brief → tasks, weekly client summary). Nothing ships yet.

## Stack

Next.js 14 (App Router, TypeScript) · Supabase (Postgres, Auth, RLS) ·
Tailwind CSS 3 + shadcn/ui (Radix) · @dnd-kit · @react-pdf/renderer · jszip ·
Vercel.

All data access happens in the browser through the Supabase client; Row Level
Security scopes every row to the caller's workspace. The only server routes are
PDF/CSV/ZIP export, team invites (service role) and the AI dispatcher.

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment

Copy `.env.local.example` → `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # server only; needed to invite teammates
ANTHROPIC_API_KEY=                    # optional; enables /api/ai when set
```

### 3. Database

Migrations live in `supabase/migrations/` and are safe to re-run:

| File | What it does |
|---|---|
| `000_baseline.sql` | Original invoice schema (fresh projects only) |
| `001_workspaces.sql` | Workspaces, members, profiles; moves data to workspace ownership; atomic numbering RPCs |
| `002_invites.sql` | Invites + auto-join trigger on signup |
| `003_crm.sql` | Client fields, contacts, notes, projects |
| `004_projects_tasks.sql` | Milestones, tasks, comments, activity log |
| `005_finance.sql` | Project links on documents, payment schedules, payments, balance views |
| `006_time_content.sql` | Time entries, content items |
| `007_ai.sql` | AI run log |
| `008_attachments.sql` | Private `attachments` storage bucket, payment slips (`payments.slip_path`) and refunds (`payments.kind`) |
| `009_refunded_status.sql` | Invoices whose refunds cancel out all payments show as Refunded with nothing owed |
| `010_expenses.sql` | Expenses: bank accounts, imported statements and transactions, receipts/invoices for payments out, import and delete RPCs |

**Existing database (already running the invoice generator):**
1. Take a backup: Supabase Dashboard → Database → Backups.
2. In the SQL Editor run `001` through `007` in order (or paste
   `supabase/ALL_001_to_007.sql` in one go), then `008`, `009` and `010`.
3. Sign in once with your existing account. You are the workspace admin.

**Fresh database:** run `000` first, then `001`–`007`, then create your first
user in Authentication → Users (invite or "Add user") and sign in.

### 4. Auth settings (Supabase Dashboard → Authentication)

- **Providers → Email:** turn off *Allow new users to sign up* (the app is
  invite-only; invites still work).
- **URL configuration:** Site URL = your deployed URL; add
  `http://localhost:3000/auth/confirm` and `https://<your-domain>/auth/confirm`
  to Redirect URLs.
- **Email templates → Invite user:** point the link at
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
  (the default `{{ .ConfirmationURL }}` also works).

### 5. Seed the real projects (optional)

After signing in once, run `supabase/seed/zneration_seed.sql` in the SQL
Editor. It creates the current clients, engagements, milestones, a few tasks,
the Wang Cheng 30-day content plan and the Wish Day 2027 payment schedule. It is
idempotent and contains no credentials.

### 6. Run

```bash
npm run dev
```

Open http://localhost:3000 and sign in. Invite teammates from **Settings → Team**.

## How things fit together

- **Workspace** — one row in `workspaces`; `workspace_members` carries the
  role (`admin` / `member`). Every table has `workspace_id` with a default of
  the caller's workspace, so inserts never need to pass it.
- **Numbering** — `{PREFIX}{YY}{MM}-{seq}` per series (EVIV/ZMIV invoices,
  EVRC/ZMRC receipts, EVQT/ZMQT quotations), reserved atomically by
  `next_invoice_no()` at save time. Hand-typed numbers bump the counter through
  `sync_invoice_counter()`.
- **Finance** — `invoice_balances` (view) derives total / paid / balance /
  status per document from line items and payments; `project_schedule_view`
  turns a project's payment schedule into expected amounts and links each row
  to the invoice generated from it.
- **Activity** — triggers write `activity_log` rows for task and project
  changes and recorded payments; the dashboard and project overview read it.
- **Time** — a partial unique index allows one running timer per person;
  starting a new one stops the previous.

## Deploy to Vercel

1. Push to GitHub and import the repo in Vercel.
2. Set the four env vars above (the AI key may be empty).
3. Add the Vercel domain to Supabase Auth redirect URLs.

PDF and ZIP routes declare `runtime = "nodejs"` and a 60 s `maxDuration`.
