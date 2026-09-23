// Matching money received on the bank statement to invoices: which recorded
// payment a bank credit is, or which open invoice it probably pays. Pure
// functions, so they are easy to check against real data.
import { compact } from "@/lib/bank/money";

export interface MatchCredit {
  id: string;
  txn_date: string;
  amount: number;
  linked_total: number;
  counterparty: string | null;
  reference: string | null;
  description: string;
  account_no: string;
}

// A payment recorded on an invoice that is not yet linked to a bank line.
export interface MatchPayment {
  id: string;
  invoice_id: string;
  amount: number;
  paid_on: string;
  reference: string | null;
  note: string | null;
  invoice_no: string;
  bill_to_name: string;
  bank_account: string | null;
}

export interface MatchInvoice {
  id: string;
  invoice_no: string;
  bill_to_name: string;
  invoice_date: string;
  total: number;
  balance: number;
  status: string | null;
  bank_account: string | null;
}

export interface ProposedLink {
  payment: MatchPayment;
  credit: MatchCredit;
  reason: string;
}

const DAY = 86_400_000;
const WINDOW_DAYS = 3;
const cents = (n: number) => Math.round(Number(n) * 100);
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

// Words that say nothing about who paid.
const STOP = new Set([
  "SDN", "BHD", "ENTERPRISE", "ENTERPRISES", "PLT", "THE", "AND", "BIN", "BINTI", "TRADING", "GROUP", "SERVICES",
  "SOLUTION", "SOLUTIONS", "VENTURE", "VENTURES", "MEDIA", "MALAYSIA", "COMPANY", "STUDIO", "SHOP", "MUHAMMAD",
  "MUHAMAD", "MOHD", "NURUL",
]);

function nameTokens(name: string): string[] {
  return name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

// Payments recorded from a statement carry the bank's wording as their reference
// (e.g. "PBB NO:410202ES FURRY ENTERPRISE ..."): the whole text, or a transaction
// or QR number from it, identifies the bank line.
function sameBankReference(credit: MatchCredit, reference: string | null | undefined): boolean {
  if (!reference) return false;
  const desc = compact(credit.description);
  const ref = compact(reference.replace(/^(PBB|UOB)\s+/i, ""));
  if (ref.length >= 12 && desc.includes(ref)) return true;
  const ids = reference.toUpperCase().match(/\bNO:(?!000000)\d{6}|QR\s?\d{8}|\b\d{9,}\b/g) ?? [];
  return ids.some((id) => desc.includes(compact(id)));
}

// How strongly the bank line itself points at this invoice or payer:
// 3 = invoice number quoted, 2 = payer name clearly present, 1 = part of the name.
// The payment note can name who actually paid (e.g. "paid by SOH MAY JUIN").
export function evidence(
  credit: MatchCredit,
  invoiceNo: string,
  billTo: string,
  payment?: { reference: string | null; note: string | null }
): { score: number; why: string | null } {
  const text = compact(`${credit.counterparty ?? ""} ${credit.reference ?? ""} ${credit.description}`);
  const no = compact(invoiceNo);
  if (no.length >= 6 && text.includes(no)) return { score: 3, why: `bank reference quotes ${invoiceNo}` };
  if (sameBankReference(credit, payment?.reference)) return { score: 3, why: "recorded with this bank line's reference" };
  const received = payment?.note?.match(/RM\s?([\d,]+(?:\.\d{1,2})?)\s+received/i);
  if (received && cents(Number(received[1].replace(/,/g, ""))) === cents(credit.amount)) {
    return { score: 2, why: `the payment note says RM${received[1]} was received` };
  }
  const whole = compact(billTo);
  if (whole.length >= 6 && text.includes(whole)) return { score: 2, why: `paid by ${billTo}` };
  const hits = nameTokens(billTo).filter((t) => text.includes(t));
  if (hits.length >= 2 || hits.some((h) => h.length >= 7)) return { score: 2, why: `name matches ${billTo}` };
  const payer = payment?.note?.match(/paid by ([^;.(]+)/i)?.[1] ?? "";
  const noteHits = nameTokens(payer).filter((t) => text.includes(t));
  if (noteHits.length >= 2) return { score: 2, why: `paid by ${payer.trim()}, as the payment note says` };
  if (hits.length === 1) return { score: 1, why: `partly matches ${billTo}` };
  return { score: 0, why: null };
}

// Pairs recorded payments with bank credits of the same amount within a few days.
// A pair is only proposed when it is unambiguous: the only candidate on both sides,
// or clearly the best by name or invoice number. Anything else is left to a person.
export function proposeLinks(payments: MatchPayment[], credits: MatchCredit[]): ProposedLink[] {
  const room = new Map(credits.map((c) => [c.id, cents(c.amount) - cents(c.linked_total)]));
  const open = new Set(payments.map((p) => p.id));
  const out: ProposedLink[] = [];

  const candidates = (p: MatchPayment) =>
    credits.filter((c) => open.has(p.id) && cents(c.amount) === cents(p.amount) && (room.get(c.id) ?? 0) >= cents(p.amount) && daysApart(c.txn_date, p.paid_on) <= WINDOW_DAYS);
  const rank = (p: MatchPayment, c: MatchCredit) => {
    const e = evidence(c, p.invoice_no, p.bill_to_name, p);
    return { e, key: e.score * 10 - daysApart(c.txn_date, p.paid_on) + (p.bank_account && p.bank_account === c.account_no ? 0.5 : 0) };
  };
  const take = (p: MatchPayment, c: MatchCredit, reason: string) => {
    out.push({ payment: p, credit: c, reason });
    open.delete(p.id);
    room.set(c.id, (room.get(c.id) ?? 0) - cents(p.amount));
  };

  // Repeat: each link can make other pairs unambiguous.
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of payments) {
      if (!open.has(p.id)) continue;
      const cands = candidates(p);
      if (!cands.length) continue;
      const ranked = cands.map((c) => ({ c, ...rank(p, c) })).sort((a, b) => b.key - a.key);
      const best = ranked[0];
      const rivals = payments.filter((q) => q.id !== p.id && open.has(q.id) && candidates(q).some((c) => c.id === best.c.id));
      const sameDay = daysApart(best.c.txn_date, p.paid_on) === 0 ? "same day" : `${daysApart(best.c.txn_date, p.paid_on)} day(s) apart`;
      if (cands.length === 1 && rivals.length === 0) {
        take(p, best.c, best.e.why ? `same amount, ${sameDay}, ${best.e.why}` : `only payment of this amount, ${sameDay}`);
        changed = true;
        continue;
      }
      const clearlyBest = best.e.score >= 2 && (ranked.length === 1 || ranked[1].e.score < best.e.score);
      const beatsRivals = rivals.every((q) => evidence(best.c, q.invoice_no, q.bill_to_name, q).score < best.e.score);
      if (clearlyBest && beatsRivals) {
        take(p, best.c, `same amount, ${sameDay}, ${best.e.why}`);
        changed = true;
      }
    }
  }

  // One transfer paying several invoices of the same payer on the same day.
  for (const c of credits) {
    const left = room.get(c.id) ?? 0;
    if (left <= 0 || left !== cents(c.amount) - cents(c.linked_total)) continue;
    const pool = payments.filter(
      (p) => open.has(p.id) && cents(p.amount) < left && daysApart(c.txn_date, p.paid_on) <= 1 && evidence(c, p.invoice_no, p.bill_to_name, p).score >= 2
    );
    const combo = findSubset(pool, left);
    if (combo) {
      for (const p of combo) take(p, c, `${combo.length} payments from the same payer add up to this transfer`);
    }
  }

  // A payment recorded for less than the transfer (an overpayment refunded later,
  // or part of a bigger transfer): only with strong evidence and one clear transfer.
  for (const p of payments) {
    if (!open.has(p.id)) continue;
    const cands = credits
      .filter((c) => cents(c.amount) > cents(p.amount) && (room.get(c.id) ?? 0) >= cents(p.amount) && daysApart(c.txn_date, p.paid_on) <= 1)
      .map((c) => ({ c, e: evidence(c, p.invoice_no, p.bill_to_name, p) }))
      .filter((x) => x.e.score >= 2)
      .sort((a, b) => b.e.score - a.e.score);
    if (cands.length === 1 || (cands.length > 1 && cands[0].e.score > cands[1].e.score)) {
      take(p, cands[0].c, `part of a RM ${(cents(cands[0].c.amount) / 100).toFixed(2)} transfer, ${cands[0].e.why}`);
    }
  }

  // Payments recorded some time after the money arrived (dated when they were
  // entered): same amount, the payer named on the bank line, and only one such credit.
  const late = (p: MatchPayment) =>
    credits.filter((c) => {
      const gap = (Date.parse(p.paid_on) - Date.parse(c.txn_date)) / DAY;
      return (
        gap > WINDOW_DAYS &&
        gap <= 90 &&
        cents(c.amount) === cents(p.amount) &&
        (room.get(c.id) ?? 0) >= cents(p.amount) &&
        evidence(c, p.invoice_no, p.bill_to_name, p).score >= 2
      );
    });
  for (const p of payments) {
    if (!open.has(p.id)) continue;
    const cands = late(p);
    if (cands.length !== 1) continue;
    const c = cands[0];
    const rivals = payments.filter((q) => q.id !== p.id && open.has(q.id) && late(q).some((x) => x.id === c.id));
    if (rivals.length) continue;
    take(p, c, `recorded ${Math.round((Date.parse(p.paid_on) - Date.parse(c.txn_date)) / DAY)} days after it arrived, ${evidence(c, p.invoice_no, p.bill_to_name, p).why}`);
  }
  return out;
}

function findSubset(pool: MatchPayment[], target: number): MatchPayment[] | null {
  const list = pool.slice(0, 12);
  for (let size = 2; size <= Math.min(4, list.length); size++) {
    const pick = (start: number, chosen: MatchPayment[], sum: number): MatchPayment[] | null => {
      if (chosen.length === size) return sum === target ? chosen : null;
      for (let i = start; i < list.length; i++) {
        const found = pick(i + 1, [...chosen, list[i]], sum + cents(list[i].amount));
        if (found) return found;
      }
      return null;
    };
    const found = pick(0, [], 0);
    if (found) return found;
  }
  return null;
}

export interface Suggestion {
  kind: "payment" | "invoice";
  invoiceId: string;
  invoiceNo: string;
  billTo: string;
  amount: number;
  payment?: MatchPayment;
  score: number;
  why: string;
}

// For one credit: recorded payments it could be, and open invoices it could pay.
export function suggestForCredit(credit: MatchCredit, payments: MatchPayment[], invoices: MatchInvoice[]): Suggestion[] {
  const left = cents(credit.amount) - cents(credit.linked_total);
  if (left <= 0) return [];
  const out: Suggestion[] = [];
  for (const p of payments) {
    if (cents(p.amount) > left) continue;
    const gap = daysApart(credit.txn_date, p.paid_on);
    if (gap > 120) continue;
    const e = evidence(credit, p.invoice_no, p.bill_to_name, p);
    if (gap > 45 && e.score < 2) continue;
    const exact = cents(p.amount) === left;
    // Same-day payments are offered even for a different amount (overpayments, part payments).
    if (!exact && e.score < 2 && gap > 1) continue;
    const score = e.score * 10 + (exact ? 8 : 0) - Math.min(gap, 30) / 3 + 5;
    out.push({
      kind: "payment",
      invoiceId: p.invoice_id,
      invoiceNo: p.invoice_no,
      billTo: p.bill_to_name,
      amount: Number(p.amount),
      payment: p,
      score,
      why: [exact ? "same amount" : null, e.why, gap === 0 ? "same day" : `${Math.round(gap)} day(s) apart`].filter(Boolean).join(", "),
    });
  }
  for (const inv of invoices) {
    if (!(Number(inv.balance) > 0) || inv.status === "void" || inv.status === "refunded") continue;
    const e = evidence(credit, inv.invoice_no, inv.bill_to_name);
    const exact = cents(inv.balance) === left || cents(inv.total) === left;
    if (!exact && e.score < 2) continue;
    const early = Date.parse(inv.invoice_date) - Date.parse(credit.txn_date) > 60 * DAY;
    const score = e.score * 10 + (exact ? 8 : 0) + (inv.bank_account && inv.bank_account === credit.account_no ? 2 : 0) - (early ? 10 : 0);
    out.push({
      kind: "invoice",
      invoiceId: inv.id,
      invoiceNo: inv.invoice_no,
      billTo: inv.bill_to_name,
      amount: Math.min(Number(inv.balance), left / 100),
      score,
      why: [exact ? "amount matches what is owed" : null, e.why].filter(Boolean).join(", ") || "open invoice",
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}
