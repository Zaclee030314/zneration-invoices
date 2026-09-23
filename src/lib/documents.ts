import { supabase } from "./supabase/client";
import { currentYymm, formatRM, seriesPrefix, type InvoiceSeries } from "./company";
import { defaultDueDate } from "./finance";
import { fetchScheduleRow } from "./queries/finance";
import type { Client, DocType, InvoiceWithItems, ProjectWithClient } from "./types";

// Copies an existing invoice/receipt into a brand-new document: assigns the next
// number in the target series, copies all fields + line items, and bumps the
// monthly counter. Used by both "Duplicate" (same type) and "Generate Receipt"
// (type -> receipt). Returns the new document id, or an error message.
export async function duplicateDocument(
  source: InvoiceWithItems,
  opts: { docType: DocType; date: string; series: InvoiceSeries[]; projectId?: string | null }
): Promise<{ id: string } | { error: string }> {
  const series = seriesPrefix(opts.docType, source.category, opts.series);
  const yymm = currentYymm(new Date(opts.date));
  const { data: newNo, error: rpcErr } = await supabase.rpc("next_invoice_no", { p_category: series, p_yymm: yymm });
  if (rpcErr || !newNo) return { error: rpcErr?.message ?? "Could not reserve a document number." };

  const { data: created, error } = await supabase
    .from("invoices")
    .insert({
      doc_type: opts.docType,
      category: source.category,
      invoice_no: newNo,
      client_id: source.client_id,
      project_id: opts.projectId === undefined ? source.project_id : opts.projectId,
      bill_to_name: source.bill_to_name,
      bill_to_reg_no: source.bill_to_reg_no,
      bill_to_address: source.bill_to_address,
      invoice_date: opts.date,
      // Only invoices carry payment terms; re-derive from the new date.
      due_date: opts.docType === "invoice" ? defaultDueDate(opts.date) || null : null,
      bank_name: source.bank_name,
      bank_account: source.bank_account,
      sales_tax_rate: source.sales_tax_rate,
      discount: source.discount,
      special_notes: source.special_notes,
    })
    .select()
    .single();
  if (error || !created) return { error: error?.message ?? "Failed to create copy." };

  const items = [...source.invoice_items].sort((a, b) => a.sort_order - b.sort_order);
  if (items.length) {
    await supabase.from("invoice_items").insert(
      items.map((it, i) => ({ invoice_id: created.id, description: it.description, line_total: it.line_total, sort_order: i }))
    );
  }

  return { id: created.id };
}

// What the new-document form can be pre-filled with from URL params
// (?project=, ?schedule=, ?client=). Resolved here so the form only applies it.
export interface DocumentPrefill {
  project: ProjectWithClient | null;
  client: Client | null;
  item: { description: string; line_total: string } | null;
  dueDate: string | null;
  schedule: { id: string; label: string } | null;
  error: string | null;
}

export async function loadDocumentPrefill(params: {
  project: string | null;
  schedule: string | null;
  client: string | null;
}): Promise<DocumentPrefill> {
  const out: DocumentPrefill = { project: null, client: null, item: null, dueDate: null, schedule: null, error: null };

  if (params.schedule) {
    const res = await fetchScheduleRow(params.schedule);
    if (res.error !== null || !res.data) out.error = res.error ?? "Schedule row not found.";
    else {
      const row = res.data;
      out.project = await loadProject(row.project_id);
      const cv = out.project?.contract_value;
      out.item = {
        description:
          row.percent != null && cv != null ? `${row.label} (${Number(row.percent)}% of RM ${formatRM(Number(cv))})` : row.label,
        line_total: row.expected_amount != null ? String(Number(row.expected_amount)) : "",
      };
      out.dueDate = row.due_date;
      out.schedule = { id: row.id, label: row.label };
    }
  }
  if (!out.project && params.project) out.project = await loadProject(params.project);

  const clientId = out.project?.client_id ?? (out.project ? null : params.client);
  if (clientId) out.client = await loadClient(clientId);
  return out;
}

async function loadClient(id: string): Promise<Client | null> {
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  return (data as Client | null) ?? null;
}

export async function loadProject(id: string): Promise<ProjectWithClient | null> {
  const { data } = await supabase.from("projects").select("*, clients(id, name)").eq("id", id).maybeSingle();
  return (data as ProjectWithClient | null) ?? null;
}

// Loads a document with its line items (what duplicateDocument needs).
export async function loadDocumentWithItems(id: string): Promise<InvoiceWithItems | null> {
  const { data } = await supabase.from("invoices").select("*, invoice_items(*)").eq("id", id).maybeSingle();
  return (data as InvoiceWithItems | null) ?? null;
}

// Voiding keeps the number in the series (never reuse numbers) but takes the
// document out of receivables: invoice_balances reports status 'void'.
export async function voidDocument(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("invoices").update({ voided_at: new Date().toISOString() }).eq("id", id);
  return { error: error?.message ?? null };
}

export async function unvoidDocument(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("invoices").update({ voided_at: null }).eq("id", id);
  return { error: error?.message ?? null };
}
