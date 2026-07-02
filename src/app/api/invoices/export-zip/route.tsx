import JSZip from "jszip";
import { renderToBuffer } from "@react-pdf/renderer";
import { supabaseForRequest } from "@/lib/supabase/server";
import { InvoicePdfDocument } from "@/lib/InvoicePdfDocument";

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

  const zip = new JSZip();
  for (const invoice of invoices) {
    const { invoice_items, ...invoiceFields } = invoice;
    const buffer = await renderToBuffer(
      <InvoicePdfDocument invoice={invoiceFields} items={invoice_items} />
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
