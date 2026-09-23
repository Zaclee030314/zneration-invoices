// Display labels and colours for every enum in the schema. Import from here so
// stages, statuses and channels look the same on every page.
import type {
  ClientStatus, ContentChannel, ContentFormat, ContentStatus, ExpenseDocKind, ExpenseStatus, InvoiceStatus,
  MilestoneStatus, PaymentMethod, Priority, ProjectHealth, ProjectKind, ProjectStage, ReceivedStatus, TaskStatus, TxnCategory,
} from "./types";

export const PROJECT_STAGES: { value: ProjectStage; label: string; color: string }[] = [
  { value: "lead", label: "Lead", color: "bg-neutral-100 text-neutral-700" },
  { value: "proposal", label: "Proposal", color: "bg-amber-100 text-amber-800" },
  { value: "active", label: "Active", color: "bg-emerald-100 text-emerald-800" },
  { value: "beta", label: "Beta", color: "bg-sky-100 text-sky-800" },
  { value: "handover", label: "Handover", color: "bg-violet-100 text-violet-800" },
  { value: "done", label: "Done", color: "bg-neutral-200 text-neutral-700" },
  { value: "dormant", label: "Dormant", color: "bg-neutral-100 text-neutral-500" },
  { value: "lost", label: "Lost", color: "bg-red-100 text-red-800" },
];
export const STAGE_LABEL = Object.fromEntries(PROJECT_STAGES.map((s) => [s.value, s.label])) as Record<ProjectStage, string>;
export const STAGE_COLOR = Object.fromEntries(PROJECT_STAGES.map((s) => [s.value, s.color])) as Record<ProjectStage, string>;
// Stages shown as columns on the pipeline board, in order.
export const PIPELINE_STAGES: ProjectStage[] = ["lead", "proposal", "active", "beta", "handover", "done", "dormant", "lost"];
export const OPEN_STAGES: ProjectStage[] = ["lead", "proposal", "active", "beta", "handover"];

export const PROJECT_KINDS: { value: ProjectKind; label: string }[] = [
  { value: "software", label: "Software" },
  { value: "marketing", label: "Marketing" },
  { value: "content", label: "Content" },
  { value: "event", label: "Event" },
  { value: "internal", label: "Internal" },
];
export const KIND_LABEL = Object.fromEntries(PROJECT_KINDS.map((k) => [k.value, k.label])) as Record<ProjectKind, string>;

export const PRIORITIES: { value: Priority; label: string; color: string; dot: string }[] = [
  { value: "low", label: "Low", color: "bg-neutral-100 text-neutral-600", dot: "bg-neutral-400" },
  { value: "medium", label: "Medium", color: "bg-sky-100 text-sky-800", dot: "bg-sky-500" },
  { value: "high", label: "High", color: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  { value: "urgent", label: "Urgent", color: "bg-red-100 text-red-800", dot: "bg-red-500" },
];
export const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.label])) as Record<Priority, string>;
export const PRIORITY_DOT = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.dot])) as Record<Priority, string>;
export const PRIORITY_COLOR = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.color])) as Record<Priority, string>;

export const HEALTHS: { value: ProjectHealth; label: string; color: string }[] = [
  { value: "on_track", label: "On track", color: "bg-emerald-100 text-emerald-800" },
  { value: "at_risk", label: "At risk", color: "bg-amber-100 text-amber-800" },
  { value: "blocked", label: "Blocked", color: "bg-red-100 text-red-800" },
];
export const HEALTH_LABEL = Object.fromEntries(HEALTHS.map((h) => [h.value, h.label])) as Record<ProjectHealth, string>;
export const HEALTH_COLOR = Object.fromEntries(HEALTHS.map((h) => [h.value, h.color])) as Record<ProjectHealth, string>;

export const TASK_STATUSES: { value: TaskStatus; label: string; color: string }[] = [
  { value: "backlog", label: "Backlog", color: "bg-neutral-100 text-neutral-600" },
  { value: "todo", label: "To do", color: "bg-neutral-200 text-neutral-800" },
  { value: "in_progress", label: "In progress", color: "bg-sky-100 text-sky-800" },
  { value: "review", label: "Review", color: "bg-violet-100 text-violet-800" },
  { value: "done", label: "Done", color: "bg-emerald-100 text-emerald-800" },
];
export const TASK_STATUS_LABEL = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s.label])) as Record<TaskStatus, string>;
export const TASK_STATUS_COLOR = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s.color])) as Record<TaskStatus, string>;

export const MILESTONE_STATUSES: { value: MilestoneStatus; label: string; color: string }[] = [
  { value: "planned", label: "Planned", color: "bg-neutral-100 text-neutral-600" },
  { value: "in_progress", label: "In progress", color: "bg-sky-100 text-sky-800" },
  { value: "done", label: "Done", color: "bg-emerald-100 text-emerald-800" },
];
export const MILESTONE_STATUS_LABEL = Object.fromEntries(MILESTONE_STATUSES.map((s) => [s.value, s.label])) as Record<MilestoneStatus, string>;
export const MILESTONE_STATUS_COLOR = Object.fromEntries(MILESTONE_STATUSES.map((s) => [s.value, s.color])) as Record<MilestoneStatus, string>;

export const CLIENT_STATUSES: { value: ClientStatus; label: string; color: string }[] = [
  { value: "lead", label: "Lead", color: "bg-amber-100 text-amber-800" },
  { value: "active", label: "Active", color: "bg-emerald-100 text-emerald-800" },
  { value: "dormant", label: "Dormant", color: "bg-neutral-100 text-neutral-500" },
  { value: "lost", label: "Lost", color: "bg-red-100 text-red-800" },
];
export const CLIENT_STATUS_LABEL = Object.fromEntries(CLIENT_STATUSES.map((s) => [s.value, s.label])) as Record<ClientStatus, string>;
export const CLIENT_STATUS_COLOR = Object.fromEntries(CLIENT_STATUSES.map((s) => [s.value, s.color])) as Record<ClientStatus, string>;

export const INVOICE_STATUSES: { value: InvoiceStatus; label: string; color: string }[] = [
  { value: "unpaid", label: "Unpaid", color: "bg-neutral-100 text-neutral-700" },
  { value: "partial", label: "Partial", color: "bg-amber-100 text-amber-800" },
  { value: "paid", label: "Paid", color: "bg-emerald-100 text-emerald-800" },
  { value: "overdue", label: "Overdue", color: "bg-red-100 text-red-800" },
  { value: "refunded", label: "Refunded", color: "bg-sky-100 text-sky-800" },
  { value: "void", label: "Void", color: "bg-neutral-200 text-neutral-500 line-through" },
];
export const INVOICE_STATUS_LABEL = Object.fromEntries(INVOICE_STATUSES.map((s) => [s.value, s.label])) as Record<InvoiceStatus, string>;
export const INVOICE_STATUS_COLOR = Object.fromEntries(INVOICE_STATUSES.map((s) => [s.value, s.color])) as Record<InvoiceStatus, string>;

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "duitnow", label: "DuitNow" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];
export const PAYMENT_METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])) as Record<PaymentMethod, string>;

// Categories for bank transactions. `directions` says whether a category applies
// to money paid out, money received, or both.
export const EXPENSE_CATEGORIES: { value: TxnCategory; label: string; color: string; directions: ("out" | "in")[] }[] = [
  { value: "advertising", label: "Advertising & ads", color: "bg-blue-100 text-blue-800", directions: ["out"] },
  { value: "event_costs", label: "Event costs", color: "bg-amber-100 text-amber-800", directions: ["out"] },
  { value: "contractors", label: "Contractors & freelancers", color: "bg-violet-100 text-violet-800", directions: ["out"] },
  { value: "salary", label: "Salary & wages", color: "bg-emerald-100 text-emerald-800", directions: ["out"] },
  { value: "staff_claim", label: "Staff claims", color: "bg-teal-100 text-teal-800", directions: ["out"] },
  { value: "rental", label: "Rental", color: "bg-orange-100 text-orange-800", directions: ["out"] },
  { value: "software", label: "Software & internet", color: "bg-sky-100 text-sky-800", directions: ["out"] },
  { value: "purchases", label: "Purchases & supplies", color: "bg-lime-100 text-lime-800", directions: ["out"] },
  { value: "transport", label: "Transport & delivery", color: "bg-cyan-100 text-cyan-800", directions: ["out"] },
  { value: "meals", label: "Meals", color: "bg-rose-100 text-rose-800", directions: ["out"] },
  { value: "professional_fees", label: "Professional fees", color: "bg-indigo-100 text-indigo-800", directions: ["out"] },
  { value: "tax_statutory", label: "Tax, EPF, SOCSO & licences", color: "bg-red-100 text-red-800", directions: ["out"] },
  { value: "bank_charges", label: "Bank charges", color: "bg-stone-100 text-stone-700", directions: ["out"] },
  { value: "refund", label: "Refunds & deposit returns", color: "bg-pink-100 text-pink-800", directions: ["out", "in"] },
  { value: "loan_advance", label: "Loans & advances", color: "bg-yellow-100 text-yellow-800", directions: ["out", "in"] },
  { value: "own_transfer", label: "Own account transfer", color: "bg-neutral-200 text-neutral-600", directions: ["out", "in"] },
  { value: "other", label: "Other", color: "bg-neutral-100 text-neutral-700", directions: ["out"] },
  { value: "customer_payment", label: "Invoice payment", color: "bg-emerald-100 text-emerald-800", directions: ["in"] },
  { value: "product_sales", label: "Product / walk-in sales", color: "bg-lime-100 text-lime-800", directions: ["in"] },
  { value: "other_income", label: "Other income", color: "bg-neutral-100 text-neutral-700", directions: ["in"] },
];
export const EXPENSE_CATEGORY_LABEL = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label])) as Record<TxnCategory, string>;
export const EXPENSE_CATEGORY_COLOR = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.color])) as Record<TxnCategory, string>;

export const EXPENSE_STATUSES: { value: ExpenseStatus; label: string; color: string }[] = [
  { value: "needs_attention", label: "Needs receipt", color: "bg-amber-100 text-amber-800" },
  { value: "done", label: "Done", color: "bg-emerald-100 text-emerald-800" },
];
export const EXPENSE_STATUS_LABEL = Object.fromEntries(EXPENSE_STATUSES.map((s) => [s.value, s.label])) as Record<ExpenseStatus, string>;
export const EXPENSE_STATUS_COLOR = Object.fromEntries(EXPENSE_STATUSES.map((s) => [s.value, s.color])) as Record<ExpenseStatus, string>;

// Money received: whether a bank credit has been linked to the invoices it paid.
export const RECEIVED_STATUSES: { value: ReceivedStatus; label: string; color: string }[] = [
  { value: "unmatched", label: "Not matched", color: "bg-amber-100 text-amber-800" },
  { value: "partial", label: "Partly matched", color: "bg-sky-100 text-sky-800" },
  { value: "matched", label: "Matched", color: "bg-emerald-100 text-emerald-800" },
  { value: "no_invoice", label: "No invoice needed", color: "bg-neutral-100 text-neutral-600" },
];
export const RECEIVED_STATUS_LABEL = Object.fromEntries(RECEIVED_STATUSES.map((s) => [s.value, s.label])) as Record<ReceivedStatus, string>;
export const RECEIVED_STATUS_COLOR = Object.fromEntries(RECEIVED_STATUSES.map((s) => [s.value, s.color])) as Record<ReceivedStatus, string>;

export const EXPENSE_DOC_KINDS: { value: ExpenseDocKind; label: string }[] = [
  { value: "invoice", label: "Invoice" },
  { value: "receipt", label: "Receipt" },
  { value: "agreement", label: "Agreement" },
  { value: "other", label: "Other" },
];
export const EXPENSE_DOC_KIND_LABEL = Object.fromEntries(EXPENSE_DOC_KINDS.map((k) => [k.value, k.label])) as Record<ExpenseDocKind, string>;

export const CONTENT_CHANNELS: { value: ContentChannel; label: string; color: string }[] = [
  { value: "instagram", label: "Instagram", color: "bg-pink-100 text-pink-800 border-pink-200" },
  { value: "facebook", label: "Facebook", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "tiktok", label: "TikTok", color: "bg-neutral-900 text-white border-neutral-900" },
  { value: "xiaohongshu", label: "Xiaohongshu", color: "bg-red-100 text-red-800 border-red-200" },
  { value: "linkedin", label: "LinkedIn", color: "bg-sky-100 text-sky-800 border-sky-200" },
  { value: "youtube", label: "YouTube", color: "bg-rose-100 text-rose-800 border-rose-200" },
  { value: "website", label: "Website", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { value: "google_ads", label: "Google Ads", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  { value: "email", label: "Email", color: "bg-violet-100 text-violet-800 border-violet-200" },
  { value: "press", label: "Press", color: "bg-orange-100 text-orange-800 border-orange-200" },
  { value: "other", label: "Other", color: "bg-neutral-100 text-neutral-700 border-neutral-200" },
];
export const CHANNEL_LABEL = Object.fromEntries(CONTENT_CHANNELS.map((c) => [c.value, c.label])) as Record<ContentChannel, string>;
export const CHANNEL_COLOR = Object.fromEntries(CONTENT_CHANNELS.map((c) => [c.value, c.color])) as Record<ContentChannel, string>;

export const CONTENT_FORMATS: { value: ContentFormat; label: string }[] = [
  { value: "post", label: "Post" },
  { value: "reel", label: "Reel" },
  { value: "story", label: "Story" },
  { value: "carousel", label: "Carousel" },
  { value: "article", label: "Article" },
  { value: "ad", label: "Ad" },
  { value: "video", label: "Video" },
  { value: "kol", label: "KOL" },
  { value: "other", label: "Other" },
];
export const FORMAT_LABEL = Object.fromEntries(CONTENT_FORMATS.map((f) => [f.value, f.label])) as Record<ContentFormat, string>;

export const CONTENT_STATUSES: { value: ContentStatus; label: string; dot: string }[] = [
  { value: "idea", label: "Idea", dot: "bg-neutral-400" },
  { value: "drafting", label: "Drafting", dot: "bg-sky-500" },
  { value: "review", label: "Review", dot: "bg-violet-500" },
  { value: "approved", label: "Approved", dot: "bg-amber-500" },
  { value: "scheduled", label: "Scheduled", dot: "bg-orange-500" },
  { value: "published", label: "Published", dot: "bg-emerald-500" },
  { value: "cancelled", label: "Cancelled", dot: "bg-red-500" },
];
export const CONTENT_STATUS_LABEL = Object.fromEntries(CONTENT_STATUSES.map((s) => [s.value, s.label])) as Record<ContentStatus, string>;
export const CONTENT_STATUS_DOT = Object.fromEntries(CONTENT_STATUSES.map((s) => [s.value, s.dot])) as Record<ContentStatus, string>;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

export function formatMinutes(min: number | null | undefined): string {
  if (!min) return "0h";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m ? `${m}m` : ""}`.trim() : `${m}m`;
}
