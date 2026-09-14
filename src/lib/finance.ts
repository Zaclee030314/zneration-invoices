// Pure finance helpers (no I/O). The SQL views in 005_finance.sql are the
// source of truth for balances/status; these mirror them for optimistic UI and
// for rows that haven't been round-tripped through the view yet.
import type { DocType, InvoiceStatus } from "./types";

// Expected amount of a schedule row: fixed amount wins, otherwise a percentage
// of the project's contract value. Mirrors project_schedule_view.expected_amount.
export function expectedAmount(
  row: { percent: number | null; amount: number | null },
  contractValue: number | null | undefined
): number | null {
  if (row.amount != null) return Number(row.amount);
  if (row.percent != null && contractValue != null) {
    return Math.round((Number(contractValue) * Number(row.percent)) / 100 * 100) / 100;
  }
  return null;
}

// Mirrors the status CASE in invoice_balances. Returns null for non-invoices.
export function deriveInvoiceStatus(
  doc: {
    total: number;
    paid_total: number;
    due_date: string | null;
    voided_at: string | null;
    doc_type: DocType;
  },
  today = new Date().toISOString().slice(0, 10)
): InvoiceStatus | null {
  if (doc.doc_type !== "invoice") return null;
  if (doc.voided_at) return "void";
  const paid = doc.paid_total ?? 0;
  if (paid >= doc.total && doc.total > 0) return "paid";
  if (paid > 0) return "partial";
  if (doc.due_date && doc.due_date < today) return "overdue";
  return "unpaid";
}

// Adds a number of days to a "YYYY-MM-DD" string without timezone drift.
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export const DEFAULT_PAYMENT_TERMS_DAYS = 30;

// Default due date for an invoice: 30 days after the invoice date.
export function defaultDueDate(invoiceDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return "";
  return addDaysIso(invoiceDate, DEFAULT_PAYMENT_TERMS_DAYS);
}

// Whole days a due date is past `today` (0 when not yet due).
export function daysOverdue(dueDate: string | null, today = new Date().toISOString().slice(0, 10)): number {
  if (!dueDate) return 0;
  const [y1, m1, d1] = dueDate.split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  const diff = (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000;
  return diff > 0 ? Math.round(diff) : 0;
}

export interface SchedulePresetRow {
  label: string;
  percent: number;
}

export interface SchedulePreset {
  key: string;
  label: string;
  rows: SchedulePresetRow[];
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  {
    key: "100",
    label: "100%",
    rows: [{ label: "Full payment", percent: 100 }],
  },
  {
    key: "50-50",
    label: "50/50",
    rows: [
      { label: "Deposit", percent: 50 },
      { label: "Final", percent: 50 },
    ],
  },
  {
    key: "30-25-25-20",
    label: "30/25/25/20",
    rows: [
      { label: "Deposit", percent: 30 },
      { label: "Milestone 1", percent: 25 },
      { label: "Milestone 2", percent: 25 },
      { label: "Final", percent: 20 },
    ],
  },
  {
    key: "50-30-20",
    label: "50/30/20",
    rows: [
      { label: "Deposit", percent: 50 },
      { label: "Milestone 1", percent: 30 },
      { label: "Final", percent: 20 },
    ],
  },
];

// Summary numbers for a project's schedule. Rows are project_schedule_view-ish.
export function scheduleTotals(
  rows: {
    percent: number | null;
    expected_amount: number | null;
    invoice_id: string | null;
    invoice_total: number | null;
    paid_total: number | null;
    invoice_status: InvoiceStatus | null;
  }[]
) {
  let percent = 0;
  let expected = 0;
  let invoiced = 0;
  let paid = 0;
  for (const r of rows) {
    percent += Number(r.percent ?? 0);
    expected += Number(r.expected_amount ?? 0);
    if (r.invoice_id && r.invoice_status !== "void") {
      invoiced += Number(r.invoice_total ?? 0);
      paid += Number(r.paid_total ?? 0);
    }
  }
  return { percent, expected, invoiced, paid, outstanding: invoiced - paid, uninvoiced: expected - invoiced };
}
