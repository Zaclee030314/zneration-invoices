import { timingSafeEqual } from "node:crypto";

export type WorkshopPaymentInput = {
  externalId: string;
  whatsappJid: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  session: "penang" | "kl";
  amount: number;
  paidOn: string;
  reference: string | null;
};

export function validSecret(received: string | null, expected: string): boolean {
  if (!received?.startsWith("Bearer ") || !expected) return false;
  const supplied = Buffer.from(received.slice(7));
  const configured = Buffer.from(expected);
  return supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

export function parseWorkshopPayment(body: unknown): WorkshopPaymentInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "A JSON request body is required." };
  const value = body as Record<string, unknown>;
  const externalId = String(value.externalId ?? "").trim();
  const whatsappJid = String(value.whatsappJid ?? "").trim();
  const customerName = String(value.customerName ?? "").trim();
  const customerPhone = String(value.customerPhone ?? "").trim();
  const customerEmail = value.customerEmail ? String(value.customerEmail).trim() : null;
  const session = String(value.session ?? "").toLowerCase();
  const amount = Math.round(Number(value.amount) * 100) / 100;
  const paidOn = String(value.paidOn ?? "").trim();
  const reference = value.reference ? String(value.reference).trim() : null;

  if (externalId.length < 3 || externalId.length > 200) return { error: "externalId is invalid." };
  if (!/^\d+@s\.whatsapp\.net$/.test(whatsappJid)) return { error: "whatsappJid is invalid." };
  if (customerName.length < 2 || customerName.length > 160) return { error: "customerName is invalid." };
  if (!/^\+?\d{8,16}$/.test(customerPhone)) return { error: "customerPhone is invalid." };
  if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return { error: "customerEmail is invalid." };
  if (session !== "penang" && session !== "kl") return { error: "session must be penang or kl." };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) return { error: "amount is invalid." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(`${paidOn}T00:00:00Z`))) return { error: "paidOn is invalid." };
  if (reference && reference.length > 200) return { error: "reference is too long." };

  return {
    externalId,
    whatsappJid,
    customerName,
    customerPhone,
    customerEmail,
    session,
    amount,
    paidOn,
    reference,
  };
}
