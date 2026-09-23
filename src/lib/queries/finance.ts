// Data access for the finance module. Views (invoice_balances,
// project_schedule_view) are security_invoker so they are queried like tables.
import { supabase } from "@/lib/supabase/client";
import type { DocType, InvoiceBalance, Payment, PaymentMethod, PaymentSchedule, ScheduleRow } from "@/lib/types";

type Result<T> = { data: T; error: null } | { data: null; error: string };

function ok<T>(data: T): Result<T> {
  return { data, error: null };
}
function fail<T>(message: string): Result<T> {
  return { data: null, error: message };
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------
export async function fetchBalancesByIds(ids: string[]): Promise<Result<InvoiceBalance[]>> {
  if (!ids.length) return ok([]);
  const { data, error } = await supabase.from("invoice_balances").select("*").in("id", ids);
  if (error) return fail(error.message);
  return ok((data as InvoiceBalance[]) ?? []);
}

export async function fetchBalance(id: string): Promise<Result<InvoiceBalance | null>> {
  const { data, error } = await supabase.from("invoice_balances").select("*").eq("id", id).maybeSingle();
  if (error) return fail(error.message);
  return ok((data as InvoiceBalance | null) ?? null);
}

export async function fetchBalances(opts: {
  docType?: DocType;
  clientId?: string;
  projectId?: string;
}): Promise<Result<InvoiceBalance[]>> {
  let q = supabase.from("invoice_balances").select("*").order("invoice_date", { ascending: false });
  if (opts.docType) q = q.eq("doc_type", opts.docType);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  const { data, error } = await q;
  if (error) return fail(error.message);
  return ok((data as InvoiceBalance[]) ?? []);
}

export async function fetchProjectBalances(projectId: string): Promise<Result<InvoiceBalance[]>> {
  return fetchBalances({ projectId });
}

// Invoices that still need chasing: flagged overdue by the view, or partially
// paid and past their due date. Oldest due date first.
export async function fetchOverdueInvoices(): Promise<Result<InvoiceBalance[]>> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("invoice_balances")
    .select("*")
    .eq("doc_type", "invoice")
    .or(`status.eq.overdue,and(status.eq.partial,due_date.lt.${today})`)
    .order("due_date", { ascending: true });
  if (error) return fail(error.message);
  return ok((data as InvoiceBalance[]) ?? []);
}

// ---------------------------------------------------------------------------
// Payment schedules
// ---------------------------------------------------------------------------
export async function fetchSchedule(projectId: string): Promise<Result<ScheduleRow[]>> {
  const { data, error } = await supabase
    .from("project_schedule_view")
    .select("*")
    .eq("project_id", projectId)
    .order("seq");
  if (error) return fail(error.message);
  return ok((data as ScheduleRow[]) ?? []);
}

export async function fetchScheduleRow(id: string): Promise<Result<ScheduleRow | null>> {
  const { data, error } = await supabase.from("project_schedule_view").select("*").eq("id", id).maybeSingle();
  if (error) return fail(error.message);
  return ok((data as ScheduleRow | null) ?? null);
}

export type ScheduleInput = {
  label: string;
  percent: number | null;
  amount: number | null;
  due_date: string | null;
  milestone_id: string | null;
};

export async function createScheduleRow(projectId: string, seq: number, input: ScheduleInput): Promise<Result<PaymentSchedule>> {
  const { data, error } = await supabase
    .from("payment_schedules")
    .insert({ project_id: projectId, seq, ...input })
    .select()
    .single();
  if (error || !data) return fail(error?.message ?? "Could not add schedule row.");
  return ok(data as PaymentSchedule);
}

export async function updateScheduleRow(id: string, patch: Partial<ScheduleInput & { seq: number; invoice_id: string | null }>): Promise<Result<true>> {
  const { error } = await supabase.from("payment_schedules").update(patch).eq("id", id);
  if (error) return fail(error.message);
  return ok(true);
}

export async function deleteScheduleRow(id: string): Promise<Result<true>> {
  const { error } = await supabase.from("payment_schedules").delete().eq("id", id);
  if (error) return fail(error.message);
  return ok(true);
}

export async function linkScheduleInvoice(scheduleId: string, invoiceId: string): Promise<Result<true>> {
  return updateScheduleRow(scheduleId, { invoice_id: invoiceId });
}

// Replaces the whole schedule with the given rows (seq 1..n). Rows already
// linked to an invoice are removed too; callers should confirm first.
export async function replaceSchedule(projectId: string, rows: ScheduleInput[]): Promise<Result<true>> {
  const { error: delErr } = await supabase.from("payment_schedules").delete().eq("project_id", projectId);
  if (delErr) return fail(delErr.message);
  if (!rows.length) return ok(true);
  const { error } = await supabase
    .from("payment_schedules")
    .insert(rows.map((r, i) => ({ project_id: projectId, seq: i + 1, ...r })));
  if (error) return fail(error.message);
  return ok(true);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export async function fetchPaymentsForInvoice(invoiceId: string): Promise<Result<Payment[]>> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return fail(error.message);
  return ok((data as Payment[]) ?? []);
}

export type PaymentWithInvoice = Payment & { invoices: Pick<InvoiceBalance, "invoice_no" | "bill_to_name"> | null };

export async function fetchPaymentsForInvoices(invoiceIds: string[]): Promise<Result<PaymentWithInvoice[]>> {
  if (!invoiceIds.length) return ok([]);
  const { data, error } = await supabase
    .from("payments")
    // payments has two FKs to invoices (invoice_id, receipt_id): name the one to embed.
    .select("*, invoices!payments_invoice_id_fkey(invoice_no, bill_to_name)")
    .in("invoice_id", invoiceIds)
    .order("paid_on", { ascending: false });
  if (error) return fail(error.message);
  return ok(((data ?? []) as unknown as PaymentWithInvoice[]));
}

export type PaymentInput = {
  invoice_id: string;
  kind?: "payment" | "refund";
  amount: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  bank_transaction_id?: string | null;
};

export async function createPayment(input: PaymentInput): Promise<Result<Payment>> {
  const { data, error } = await supabase.from("payments").insert(input).select().single();
  if (error || !data) return fail(error?.message ?? "Could not record payment.");
  return ok(data as Payment);
}

export async function updatePayment(id: string, patch: Partial<PaymentInput & { receipt_id: string | null }>): Promise<Result<true>> {
  const { error } = await supabase.from("payments").update(patch).eq("id", id);
  if (error) return fail(error.message);
  return ok(true);
}

export async function deletePayment(id: string): Promise<Result<true>> {
  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) return fail(error.message);
  return ok(true);
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------
// Marks a quotation as the accepted one for a project and copies its total
// into projects.contract_value. Pass null to clear the link (keeps the value).
export async function setAcceptedQuotation(projectId: string, quotationId: string | null): Promise<Result<{ contract_value: number | null }>> {
  if (!quotationId) {
    const { error } = await supabase.from("projects").update({ quotation_id: null }).eq("id", projectId);
    if (error) return fail(error.message);
    return ok({ contract_value: null });
  }
  const bal = await fetchBalance(quotationId);
  if (bal.error) return fail(bal.error);
  if (!bal.data) return fail("Quotation not found.");
  const contract_value = Number(bal.data.total);
  const { error } = await supabase.from("projects").update({ quotation_id: quotationId, contract_value }).eq("id", projectId);
  if (error) return fail(error.message);
  return ok({ contract_value });
}

export async function updateContractValue(projectId: string, value: number | null): Promise<Result<true>> {
  const { error } = await supabase.from("projects").update({ contract_value: value }).eq("id", projectId);
  if (error) return fail(error.message);
  return ok(true);
}
