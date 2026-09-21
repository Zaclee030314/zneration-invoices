import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseWorkshopPayment, validSecret } from "@/lib/workshop-integration";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_INTEGRATION_SECRET ?? "";
  if (!validSecret(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const workspaceId = process.env.WHATSAPP_WORKSPACE_ID;
  if (!workspaceId) {
    return NextResponse.json({ error: "Workshop integration is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const input = parseWorkshopPayment(body);
  if ("error" in input) return NextResponse.json(input, { status: 400 });

  const { data, error } = await supabaseAdmin().rpc("create_workshop_payment_documents", {
    p_workspace_id: workspaceId,
    p_external_id: input.externalId,
    p_whatsapp_jid: input.whatsappJid,
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_customer_email: input.customerEmail,
    p_session: input.session,
    p_amount: input.amount,
    p_paid_on: input.paidOn,
    p_reference: input.reference,
  });

  if (error || !data) {
    console.error("Workshop document RPC failed", { code: error?.code, message: error?.message });
    return NextResponse.json({ error: "Could not create the invoice and receipt." }, { status: 500 });
  }

  return NextResponse.json(data, { status: 200 });
}
