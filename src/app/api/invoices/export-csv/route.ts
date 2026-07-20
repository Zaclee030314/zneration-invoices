import { supabaseForRequest } from "@/lib/supabase/server";
import { invoiceTotals } from "@/lib/types";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: Request) {
  const supabase = supabaseForRequest(req);
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const docType = searchParams.get("docType");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const search = searchParams.get("search");

  let query = supabase.from("invoices").select("*, invoice_items(*)");
  if (docType === "invoice" || docType === "receipt" || docType === "quotation") query = query.eq("doc_type", docType);
  if (category === "EVIV" || category === "ZMIV") query = query.eq("category", category);
  if (from) query = query.gte("invoice_date", from);
  if (to) query = query.lte("invoice_date", to);
  if (search) query = query.or(`invoice_no.ilike.%${search}%,bill_to_name.ilike.%${search}%`);

  const { data: invoices, error } = await query.order("invoice_date", { ascending: false });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const header = ["No.", "Type", "Category", "Bill To", "Date", "Subtotal", "Sales Tax", "Discount", "Total"];
  const rows = (invoices ?? []).map((inv) => {
    const { subtotal, salesTax, total } = invoiceTotals(inv, inv.invoice_items);
    return [
      inv.invoice_no,
      inv.doc_type,
      inv.category,
      inv.bill_to_name,
      inv.invoice_date,
      subtotal.toFixed(2),
      salesTax.toFixed(2),
      inv.discount.toFixed(2),
      total.toFixed(2),
    ];
  });

  const csv = [header, ...rows].map((r) => r.map((c) => csvEscape(String(c))).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="invoices.csv"`,
    },
  });
}
