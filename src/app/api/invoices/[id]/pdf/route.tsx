import { renderToBuffer } from "@react-pdf/renderer";
import { supabaseForRequest } from "@/lib/supabase/server";
import { companyProfileFor } from "@/lib/supabase/active-workspace";
import { InvoicePdfDocument } from "@/lib/InvoicePdfDocument";

// react-pdf needs the Node runtime; PDF/ZIP generation can take a few seconds.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseForRequest(req);
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*, invoice_items(*)")
    .eq("id", params.id)
    .single();

  if (error || !invoice) {
    return new Response(error?.message ?? "Invoice not found", { status: 404 });
  }

  const { company } = await companyProfileFor(supabase, invoice.workspace_id);
  const { invoice_items, ...invoiceFields } = invoice;
  const buffer = await renderToBuffer(
    <InvoicePdfDocument invoice={invoiceFields} items={invoice_items} company={company} />
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoice_no}.pdf"`,
    },
  });
}
