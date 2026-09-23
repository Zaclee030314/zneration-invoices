// Data access for Money received: bank credits and the invoice payments linked
// to them (payments.bank_transaction_id, migration 012).
import { supabase } from "@/lib/supabase/client";
import type { MatchCredit, MatchInvoice, MatchPayment } from "@/lib/receipts";
import type { BankTransactionRow, InvoiceBalance, PaymentMethod } from "@/lib/types";
import { fetchTransactions } from "./expenses";

type Result<T> = { data: T; error: null } | { data: null; error: string };
const ok = <T,>(data: T): Result<T> => ({ data, error: null });
const fail = <T,>(message: string): Result<T> => ({ data: null, error: message });

const PAGE = 1000;
// payments has two FKs to invoices (invoice_id, receipt_id): name the one to embed.
const INVOICE_EMBED = "invoices!payments_invoice_id_fkey(invoice_no, bill_to_name, bank_account)";

const MISSING = "Run supabase/migrations/012_money_received.sql in the Supabase SQL editor first.";
const friendly = (msg: string) => (/bank_transaction_id|link_bank_payments/.test(msg) && /(does not exist|schema cache|could not find)/i.test(msg) ? MISSING : msg);

export interface LinkedPayment {
  id: string;
  invoice_id: string;
  amount: number;
  paid_on: string;
  receipt_id: string | null;
  bank_transaction_id: string;
  invoice_no: string;
  bill_to_name: string;
}

type PaymentRow = {
  id: string;
  invoice_id: string;
  amount: number;
  paid_on: string;
  reference: string | null;
  note: string | null;
  receipt_id: string | null;
  bank_transaction_id: string | null;
  invoices: { invoice_no: string; bill_to_name: string; bank_account: string | null } | null;
};

async function fetchPayments(linked: boolean): Promise<Result<PaymentRow[]>> {
  const rows: PaymentRow[] = [];
  for (let start = 0; ; start += PAGE) {
    let q = supabase
      .from("payments")
      .select(`id, invoice_id, amount, paid_on, reference, note, receipt_id, bank_transaction_id, kind, ${INVOICE_EMBED}`)
      .eq("kind", "payment")
      .order("id")
      .range(start, start + PAGE - 1);
    q = linked ? q.not("bank_transaction_id", "is", null) : q.is("bank_transaction_id", null);
    const { data, error } = await q;
    if (error) return fail(friendly(error.message));
    rows.push(...((data ?? []) as unknown as PaymentRow[]));
    if (!data || data.length < PAGE) break;
  }
  return ok(rows);
}

// Payments recorded on invoices that are not linked to a bank line yet.
export async function fetchUnlinkedPayments(): Promise<Result<MatchPayment[]>> {
  const res = await fetchPayments(false);
  if (res.error !== null) return res;
  return ok(
    res.data.map((p) => ({
      id: p.id,
      invoice_id: p.invoice_id,
      amount: Number(p.amount),
      paid_on: p.paid_on,
      reference: p.reference,
      note: p.note,
      invoice_no: p.invoices?.invoice_no ?? "",
      bill_to_name: p.invoices?.bill_to_name ?? "",
      bank_account: p.invoices?.bank_account ?? null,
    }))
  );
}

// Invoice payments already linked, grouped by bank line.
export async function fetchLinkedPayments(): Promise<Result<Record<string, LinkedPayment[]>>> {
  const res = await fetchPayments(true);
  if (res.error !== null) return res;
  const byTxn: Record<string, LinkedPayment[]> = {};
  for (const p of res.data) {
    const row: LinkedPayment = {
      id: p.id,
      invoice_id: p.invoice_id,
      amount: Number(p.amount),
      paid_on: p.paid_on,
      receipt_id: p.receipt_id,
      bank_transaction_id: p.bank_transaction_id as string,
      invoice_no: p.invoices?.invoice_no ?? "",
      bill_to_name: p.invoices?.bill_to_name ?? "",
    };
    (byTxn[row.bank_transaction_id] ??= []).push(row);
  }
  return ok(byTxn);
}

// Invoices with their balance and the bank account printed on them.
export async function fetchMatchInvoices(): Promise<Result<MatchInvoice[]>> {
  const [bal, inv] = await Promise.all([
    supabase.from("invoice_balances").select("*").eq("doc_type", "invoice").limit(5000),
    supabase.from("invoices").select("id, bank_account").eq("doc_type", "invoice").limit(5000),
  ]);
  if (bal.error) return fail(bal.error.message);
  if (inv.error) return fail(inv.error.message);
  const bank = new Map((inv.data ?? []).map((r) => [r.id as string, (r.bank_account as string | null) ?? null]));
  return ok(
    ((bal.data ?? []) as InvoiceBalance[]).map((b) => ({
      id: b.id,
      invoice_no: b.invoice_no,
      bill_to_name: b.bill_to_name,
      invoice_date: b.invoice_date,
      total: Number(b.total),
      balance: Number(b.balance),
      status: b.status,
      bank_account: bank.get(b.id) ?? null,
    }))
  );
}

// Every credit on every statement, for matching payments recorded in any year.
export async function fetchAllCredits(): Promise<Result<BankTransactionRow[]>> {
  return fetchTransactions({ from: "2000-01-01", to: "2100-12-31" }, "in");
}

export function toMatchCredit(t: BankTransactionRow): MatchCredit {
  return {
    id: t.id,
    txn_date: t.txn_date,
    amount: Number(t.amount),
    linked_total: Number(t.linked_total ?? 0),
    counterparty: t.counterparty,
    reference: t.reference,
    description: t.description,
    account_no: t.account_no,
  };
}

export async function linkPayment(paymentId: string, txnId: string): Promise<Result<true>> {
  const { error } = await supabase.from("payments").update({ bank_transaction_id: txnId }).eq("id", paymentId);
  if (error) return fail(friendly(error.message));
  return ok(true);
}

export async function unlinkPayment(paymentId: string): Promise<Result<true>> {
  const { error } = await supabase.from("payments").update({ bank_transaction_id: null }).eq("id", paymentId);
  if (error) return fail(friendly(error.message));
  return ok(true);
}

export async function linkPayments(links: { payment_id: string; bank_transaction_id: string }[]): Promise<Result<number>> {
  if (!links.length) return ok(0);
  const { data, error } = await supabase.rpc("link_bank_payments", { p_links: links });
  if (error) return fail(friendly(error.message));
  return ok(Number(data ?? 0));
}

// DuitNow lines say so on the statement; everything else is a bank transfer.
export function methodFor(t: Pick<BankTransactionRow, "txn_type" | "description">): PaymentMethod {
  return /DUITNOW|DUITQR/i.test(`${t.txn_type ?? ""} ${t.description}`) ? "duitnow" : "bank_transfer";
}
