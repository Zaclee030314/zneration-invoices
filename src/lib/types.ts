export type InvoiceCategory = "EVIV" | "ZMIV";
export type DocType = "invoice" | "receipt" | "quotation";
export type WorkspaceRole = "admin" | "member";

// ---------------------------------------------------------------------------
// Workspace / people
// ---------------------------------------------------------------------------
export interface Workspace {
  id: string;
  name: string;
  slug: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
}

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------
export type ClientStatus = "lead" | "active" | "dormant" | "lost";

export interface Client {
  id: string;
  owner_id: string;
  workspace_id: string;
  name: string;
  reg_no: string | null;
  address: string | null;
  default_category: InvoiceCategory | null;
  status: ClientStatus;
  industry: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  workspace_id: string;
  client_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
}

export interface Note {
  id: string;
  workspace_id: string;
  client_id: string | null;
  project_id: string | null;
  author_id: string | null;
  body: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export type ProjectKind = "software" | "marketing" | "content" | "event" | "internal";
export type ProjectStage = "lead" | "proposal" | "active" | "beta" | "handover" | "done" | "lost" | "dormant";
export type Priority = "low" | "medium" | "high" | "urgent";
export type ProjectHealth = "on_track" | "at_risk" | "blocked";

export interface Project {
  id: string;
  workspace_id: string;
  client_id: string | null;
  code: string;
  name: string;
  description: string | null;
  kind: ProjectKind;
  stage: ProjectStage;
  stage_position: number;
  contract_value: number | null;
  currency: string;
  start_date: string | null;
  due_date: string | null;
  lead_user_id: string | null;
  url: string | null;
  priority: Priority;
  health: ProjectHealth;
  quotation_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface ProjectWithClient extends Project {
  clients: Pick<Client, "id" | "name"> | null;
}

export type MilestoneStatus = "planned" | "in_progress" | "done";

export interface Milestone {
  id: string;
  workspace_id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: MilestoneStatus;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
}

export type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done";

export interface Task {
  id: string;
  workspace_id: string;
  project_id: string;
  milestone_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assignee_id: string | null;
  due_date: string | null;
  position: number;
  estimate_min: number | null;
  labels: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
}

export interface TaskComment {
  id: string;
  workspace_id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface ActivityEntry {
  id: number;
  workspace_id: string;
  actor_id: string | null;
  entity_type: "task" | "project" | "invoice" | "payment" | "milestone" | "content_item" | string;
  entity_id: string;
  project_id: string | null;
  action: string;
  data: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Documents / finance
// ---------------------------------------------------------------------------
export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  line_total: number | null;
  sort_order: number;
}

export interface Invoice {
  id: string;
  owner_id: string;
  workspace_id: string;
  invoice_no: string;
  doc_type: DocType;
  category: InvoiceCategory;
  client_id: string | null;
  project_id: string | null;
  bill_to_name: string;
  bill_to_reg_no: string | null;
  bill_to_address: string | null;
  invoice_date: string;
  due_date: string | null;
  voided_at: string | null;
  bank_name: string | null;
  bank_account: string | null;
  sales_tax_rate: number;
  discount: number;
  special_notes: string | null;
  created_at: string;
}

export interface InvoiceWithItems extends Invoice {
  invoice_items: InvoiceItem[];
}

export type InvoiceStatus = "unpaid" | "partial" | "paid" | "overdue" | "refunded" | "void";

// Row shape of the invoice_balances view.
export interface InvoiceBalance {
  id: string;
  workspace_id: string;
  project_id: string | null;
  client_id: string | null;
  doc_type: DocType;
  invoice_no: string;
  bill_to_name: string;
  invoice_date: string;
  due_date: string | null;
  voided_at: string | null;
  total: number;
  paid_total: number;
  balance: number;
  last_paid_on: string | null;
  status: InvoiceStatus | null;
}

export interface PaymentSchedule {
  id: string;
  workspace_id: string;
  project_id: string;
  seq: number;
  label: string;
  percent: number | null;
  amount: number | null;
  due_date: string | null;
  milestone_id: string | null;
  invoice_id: string | null;
  created_at: string;
}

// Row shape of project_schedule_view.
export interface ScheduleRow extends PaymentSchedule {
  expected_amount: number | null;
  invoice_no: string | null;
  invoice_status: InvoiceStatus | null;
  paid_total: number | null;
  invoice_total: number | null;
}

export type PaymentMethod = "bank_transfer" | "duitnow" | "cash" | "cheque" | "card" | "other";
// A refund is money returned to the client; it reduces the invoice's paid total.
export type PaymentKind = "payment" | "refund";

export interface Payment {
  id: string;
  workspace_id: string;
  invoice_id: string;
  kind: PaymentKind;
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  receipt_id: string | null;
  slip_path: string | null;
  created_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Expenses (imported bank statements)
// ---------------------------------------------------------------------------
export type { BankCode, TxnCategory } from "./bank/types";
import type { BankCode, TxnCategory } from "./bank/types";

export type ExpenseStatus = "done" | "needs_attention";
export type ExpenseDoneReason = "documents" | "explanation" | "own_transfer" | "zero_amount";
export type ExpenseDocKind = "invoice" | "receipt" | "agreement" | "other";
export type CategorySource = "auto" | "history" | "user";

export interface BankAccount {
  id: string;
  workspace_id: string;
  bank: BankCode;
  account_no: string;
  account_name: string | null;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface StatementValidation {
  checks?: { code: string; ok: boolean; message: string }[];
  warnings?: string[];
  segmentation?: string;
}

export interface BankStatement {
  id: string;
  workspace_id: string;
  account_id: string;
  period_start: string;
  period_end: string;
  file_path: string;
  file_name: string;
  file_sha256: string;
  opening_balance: number;
  closing_balance: number;
  total_in: number;
  total_out: number;
  txn_count: number;
  inserted_count: number;
  duplicate_count: number;
  parser_version: string | null;
  validation: StatementValidation;
  uploaded_by: string | null;
  created_at: string;
}

export interface BankTransaction {
  id: string;
  workspace_id: string;
  account_id: string;
  statement_id: string;
  seq: number;
  page: number | null;
  posted_on: string;
  txn_date: string;
  txn_at: string | null;
  direction: "in" | "out";
  amount: number;
  balance: number;
  description: string;
  desc_lines: string[];
  txn_type: string | null;
  reference: string | null;
  counterparty: string | null;
  counterparty_key: string | null;
  fingerprint: string;
  category: TxnCategory | null;
  category_source: CategorySource | null;
  project_id: string | null;
  tag: string | null;
  explanation: string | null;
  created_at: string;
  updated_at: string;
}

// Row shape of bank_transactions_view.
export interface BankTransactionRow extends BankTransaction {
  bank: BankCode;
  account_no: string;
  account_label: string;
  project_code: string | null;
  project_name: string | null;
  project_kind: ProjectKind | null;
  doc_count: number;
  status: ExpenseStatus | null;
  done_reason: ExpenseDoneReason | null;
}

export interface ExpenseDocument {
  id: string;
  workspace_id: string;
  transaction_id: string;
  kind: ExpenseDocKind;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  note: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface BankTag {
  workspace_id: string;
  tag: string;
  use_count: number;
  last_used_at: string;
}

// What /api/expenses/statements reports about an uploaded statement before import.
export interface StatementPreview {
  bank: BankCode;
  accountNo: string;
  accountName: string | null;
  accountId: string | null;
  accountLabel: string | null;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  totalIn: number;
  totalOut: number;
  txnCount: number;
  moneyOutCount: number;
  checks: { code: string; ok: boolean; message: string }[];
  warnings: string[];
  ok: boolean;
  segmentation: string;
  alreadyImported: { id: string; file_name: string; created_at: string } | null;
  overlapping: { id: string; file_name: string; period_start: string; period_end: string }[];
  newCount: number;
  duplicateCount: number;
}

export interface StatementImportResult {
  status: "imported" | "already_imported";
  statement_id: string;
  account_id: string;
  inserted?: number;
  duplicates?: number;
}

// ---------------------------------------------------------------------------
// Time / content
// ---------------------------------------------------------------------------
export interface TimeEntry {
  id: string;
  workspace_id: string;
  user_id: string;
  project_id: string;
  task_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_min: number | null;
  note: string | null;
  billable: boolean;
  created_at: string;
}

export type ContentChannel =
  | "instagram" | "facebook" | "tiktok" | "xiaohongshu" | "linkedin" | "youtube"
  | "website" | "google_ads" | "email" | "press" | "other";
export type ContentFormat = "post" | "reel" | "story" | "carousel" | "article" | "ad" | "video" | "kol" | "other";
export type ContentStatus = "idea" | "drafting" | "review" | "approved" | "scheduled" | "published" | "cancelled";

export interface ContentItem {
  id: string;
  workspace_id: string;
  project_id: string | null;
  client_id: string | null;
  task_id: string | null;
  title: string;
  channel: ContentChannel;
  format: ContentFormat;
  status: ContentStatus;
  due_date: string;
  publish_at: string | null;
  assignee_id: string | null;
  caption: string | null;
  asset_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function invoiceSubtotal(items: Pick<InvoiceItem, "line_total">[]): number {
  return items.reduce((sum, it) => sum + (it.line_total ?? 0), 0);
}

export function invoiceTotals(invoice: Pick<Invoice, "sales_tax_rate" | "discount">, items: Pick<InvoiceItem, "line_total">[]) {
  const subtotal = invoiceSubtotal(items);
  const salesTax = (subtotal * (invoice.sales_tax_rate || 0)) / 100;
  const total = subtotal + salesTax - (invoice.discount || 0);
  return { subtotal, salesTax, total };
}
