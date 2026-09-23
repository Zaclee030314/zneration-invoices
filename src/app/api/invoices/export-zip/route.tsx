import JSZip from "jszip";
import { renderToBuffer } from "@react-pdf/renderer";
import { supabaseForRequest } from "@/lib/supabase/server";
import { InvoicePdfDocument } from "@/lib/InvoicePdfDocument";
import { companyProfileFor } from "@/lib/supabase/active-workspace";
import type { CompanyDetails } from "@/lib/company";

// react-pdf needs the Node runtime; PDF/ZIP generation can take a few seconds.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { ids }: { ids: string[] } = await req.json();
  if (!ids?.length) {
    return new Response("No invoice ids provided", { status: 400 });
  }

  const supabase = supabaseForRequest(req);
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("*, invoice_items(*)")
    .in("id", ids);

  if (error || !invoices?.length) {
    return new Response(error?.message ?? "Invoices not found", { status: 404 });
  }

  const profiles = new Map<string, CompanyDetails>();
  const zip = new JSZip();
  for (const invoice of invoices) {
    const { invoice_items, ...invoiceFields } = invoice;
    if (!profiles.has(invoice.workspace_id)) profiles.set(invoice.workspace_id, (await companyProfileFor(supabase, invoice.workspace_id)).company);
    const buffer = await renderToBuffer(
      <InvoicePdfDocument invoice={invoiceFields} items={invoice_items} company={profiles.get(invoice.workspace_id) as CompanyDetails} />
    );
    const safeName = invoice.bill_to_name.replace(/[\\/:*?"<>|]/g, "-");
    zip.file(`${invoice.invoice_no} - ${safeName}.pdf`, buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="invoices.zip"`,
    },
  });
}
