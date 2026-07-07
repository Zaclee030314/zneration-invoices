import { supabase } from "./supabase/client";
import { currentYymm, seriesPrefix } from "./company";
import type { DocType, InvoiceWithItems } from "./types";

// Copies an existing invoice/receipt into a brand-new document: assigns the next
// number in the target series, copies all fields + line items, and bumps the
// monthly counter. Used by both "Duplicate" (same type) and "Generate Receipt"
// (type -> receipt). Returns the new document id, or an error message.
export async function duplicateDocument(
  source: InvoiceWithItems,
  opts: { docType: DocType; date: string }
): Promise<{ id: string } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const series = seriesPrefix(opts.docType, source.category);
  const yymm = currentYymm(new Date(opts.date));
  const { data: ctr } = await supabase
    .from("invoice_counters")
    .select("last_seq")
    .eq("category", series)
    .eq("yymm", yymm)
    .maybeSingle();
  const seq = (ctr?.last_seq ?? 0) + 1;
  const newNo = `${series}${yymm}-${String(seq).padStart(2, "0")}`;

  const { data: created, error } = await supabase
    .from("invoices")
    .insert({
      owner_id: user.id,
      doc_type: opts.docType,
      category: source.category,
      invoice_no: newNo,
      client_id: source.client_id,
      bill_to_name: source.bill_to_name,
      bill_to_reg_no: source.bill_to_reg_no,
      bill_to_address: source.bill_to_address,
      invoice_date: opts.date,
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

  if (ctr) {
    await supabase.from("invoice_counters").update({ last_seq: seq }).eq("category", series).eq("yymm", yymm);
  } else {
    await supabase.from("invoice_counters").insert({ owner_id: user.id, category: series, yymm, last_seq: seq });
  }

  return { id: created.id };
}
