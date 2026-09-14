"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CategoryBadge } from "@/components/CategoryBadge";
import { InvoiceStatusBadge } from "@/components/finance/InvoiceStatusBadge";
import { PaymentDialog } from "@/components/finance/PaymentDialog";
import { PaymentsList } from "@/components/finance/PaymentsList";
import { supabase } from "@/lib/supabase/client";
import { downloadFromApi } from "@/lib/download";
import { invoiceTotals, type InvoiceBalance, type InvoiceWithItems, type Payment, type PaymentKind, type Project } from "@/lib/types";
import { COMPANY, DOC_TITLE, DOC_NUMBER_LABEL, docBasePath, docFooter, formatRM } from "@/lib/company";
import { duplicateDocument, unvoidDocument, voidDocument } from "@/lib/documents";
import { fetchBalance, fetchPaymentsForInvoice } from "@/lib/queries/finance";
import { formatDate } from "@/lib/labels";
import { isClosedInvoiceStatus } from "@/lib/finance";
import { cn } from "@/lib/utils";

type ProjectRef = Pick<Project, "id" | "code" | "name">;

export function DocumentDetail({ id }: { id: string }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceWithItems | null>(null);
  const [project, setProject] = useState<ProjectRef | null>(null);
  const [balance, setBalance] = useState<InvoiceBalance | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [payMode, setPayMode] = useState<PaymentKind | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("invoices").select("*, invoice_items(*)").eq("id", id).maybeSingle();
    if (error) toast.error(error.message);
    const inv = (data as InvoiceWithItems | null) ?? null;
    setInvoice(inv);
    if (inv) {
      const [bal, pays, proj] = await Promise.all([
        fetchBalance(inv.id),
        inv.doc_type === "invoice" ? fetchPaymentsForInvoice(inv.id) : Promise.resolve({ data: [] as Payment[], error: null }),
        inv.project_id
          ? supabase.from("projects").select("id, code, name").eq("id", inv.project_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (bal.error) toast.error(bal.error);
      if (pays.error) toast.error(pays.error);
      setBalance(bal.data ?? null);
      setPayments(pays.data ?? []);
      setProject((proj.data as ProjectRef | null) ?? null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Copy this invoice into a brand-new receipt (own EVRC/ZMRC number), then open it.
  async function generateReceipt() {
    if (!invoice || busy) return;
    setBusy(true);
    const res = await duplicateDocument(invoice, { docType: "receipt", date: invoice.invoice_date });
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    router.push(`/receipts/${res.id}`);
  }

  // Copy this quotation into a brand-new invoice (own EVIV/ZMIV number, today's
  // date), then open it in the editor for final tweaks before sending.
  async function generateInvoice() {
    if (!invoice || busy) return;
    setBusy(true);
    const today = new Date().toISOString().slice(0, 10);
    const res = await duplicateDocument(invoice, { docType: "invoice", date: today });
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    router.push(`/invoices/${res.id}/edit`);
  }

  // Duplicate as the same type (next number, today's date), then open it in the
  // editor so the date/name/etc. can be tweaked before saving.
  async function duplicate() {
    if (!invoice || busy) return;
    setBusy(true);
    const today = new Date().toISOString().slice(0, 10);
    const res = await duplicateDocument(invoice, { docType: invoice.doc_type, date: today });
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    router.push(`${docBasePath(invoice.doc_type)}/${res.id}/edit`);
  }

  async function toggleVoid() {
    if (!invoice || busy) return;
    const voided = !!invoice.voided_at;
    const msg = voided
      ? "Restore this invoice? It will count towards receivables again."
      : "Void this invoice? It keeps its number but no longer counts as owed.";
    if (!confirm(msg)) return;
    setBusy(true);
    const res = voided ? await unvoidDocument(invoice.id) : await voidDocument(invoice.id);
    setBusy(false);
    if (res.error) return toast.error(res.error);
    toast.success(voided ? "Invoice restored." : "Invoice voided.");
    load();
  }

  if (loading) return <p className="text-sm text-neutral-500">Loading...</p>;
  if (!invoice) return <p className="text-sm text-neutral-500">Document not found.</p>;

  const items = [...invoice.invoice_items].sort((a, b) => a.sort_order - b.sort_order);
  const { subtotal, salesTax, total } = invoiceTotals(invoice, items);
  const isInvoice = invoice.doc_type === "invoice";
  const isVoid = !!invoice.voided_at;
  const paidTotal = Number(balance?.paid_total ?? 0);
  const remaining = balance ? Number(balance.balance) : total - paidTotal;
  const status = balance?.status ?? null;

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className={cn("text-2xl font-semibold", isVoid && "line-through text-neutral-400")}>{invoice.invoice_no}</h1>
          <CategoryBadge category={invoice.category} />
          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700">{DOC_TITLE[invoice.doc_type]}</span>
          {isInvoice && <InvoiceStatusBadge status={status} />}
        </div>
        <div className="flex gap-2 flex-wrap">
          {isInvoice && !isClosedInvoiceStatus(status) && status !== "paid" && (
            <button onClick={() => setPayMode("payment")} disabled={busy} className="border border-emerald-600 text-emerald-700 rounded px-3 py-1.5 text-sm disabled:opacity-50">
              Record payment
            </button>
          )}
          {isInvoice && paidTotal > 0 && (
            <button onClick={() => setPayMode("refund")} disabled={busy} className="border border-red-300 text-red-700 rounded px-3 py-1.5 text-sm disabled:opacity-50">
              Record refund
            </button>
          )}
          {isInvoice && (
            <button onClick={toggleVoid} disabled={busy} className="border rounded px-3 py-1.5 text-sm disabled:opacity-50">
              {isVoid ? "Unvoid" : "Void"}
            </button>
          )}
          <button onClick={duplicate} disabled={busy} className="border rounded px-3 py-1.5 text-sm disabled:opacity-50">
            {busy ? "..." : "Duplicate"}
          </button>
          {isInvoice && (
            <button onClick={generateReceipt} disabled={busy} className="border rounded px-3 py-1.5 text-sm disabled:opacity-50">
              {busy ? "..." : "Generate Receipt"}
            </button>
          )}
          {invoice.doc_type === "quotation" && (
            <button onClick={generateInvoice} disabled={busy} className="border rounded px-3 py-1.5 text-sm disabled:opacity-50">
              {busy ? "..." : "Generate Invoice"}
            </button>
          )}
          <Link href={`${docBasePath(invoice.doc_type)}/${invoice.id}/edit`} className="border rounded px-3 py-1.5 text-sm">Edit</Link>
          <button
            onClick={() => downloadFromApi(`/api/invoices/${invoice.id}/pdf`, `${invoice.invoice_no}.pdf`)}
            className="bg-neutral-900 text-white rounded px-3 py-1.5 text-sm"
          >
            Download PDF
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-600 mb-6">
        {project && (
          <span>
            Project:{" "}
            <Link href={`/projects/${project.id}`} className="font-medium text-neutral-900 hover:underline">
              <span className="font-mono text-xs mr-1">{project.code}</span>
              {project.name}
            </Link>
          </span>
        )}
        {isInvoice && invoice.due_date && (
          <span className={cn(status === "overdue" && "text-red-700")}>Due: <span className="font-medium">{formatDate(invoice.due_date)}</span></span>
        )}
        {isVoid && <span className="text-neutral-500">Voided {formatDate(invoice.voided_at)}</span>}
      </div>

      {isInvoice && (
        <div className="bg-white border rounded p-4 max-w-3xl mb-6">
          <div className="grid grid-cols-3 gap-4 text-sm mb-4">
            <Stat label="Total" value={total} />
            <Stat label="Paid" value={paidTotal} />
            <Stat label="Balance" value={isVoid ? 0 : remaining} highlight={!isVoid && remaining > 0} />
          </div>
          <h2 className="text-sm font-medium mb-2">Payments</h2>
          <PaymentsList payments={payments} onChanged={load} />
        </div>
      )}

      <div className={cn("bg-white border rounded p-8 max-w-3xl relative", isVoid && "opacity-60")}>
        {isVoid && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-6xl font-bold text-red-200 -rotate-12 tracking-widest">VOID</span>
          </div>
        )}
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold">{COMPANY.name}</h2>
            <p className="text-xs text-neutral-500">{COMPANY.regNo}</p>
          </div>
          <h2 className="text-2xl font-bold text-[#1f4e79]">{DOC_TITLE[invoice.doc_type]}</h2>
        </div>

        <div className="flex justify-between items-start mt-6">
          <div className="w-3/5">
            <div className="bg-[#1f4e79] text-white text-sm font-medium px-2 py-1">Bill To:</div>
            <div className="mt-2 text-sm">
              <p className="font-medium">{invoice.bill_to_name}</p>
              {invoice.bill_to_reg_no && <p>{invoice.bill_to_reg_no}</p>}
              {invoice.bill_to_address && <p className="whitespace-pre-line">{invoice.bill_to_address}</p>}
            </div>
          </div>
          <div className="w-1/3 text-sm">
            <div className="flex border mb-0.5">
              <div className="w-2/5 bg-neutral-50 px-2 py-1">Date:</div>
              <div className="w-3/5 px-2 py-1">{new Date(invoice.invoice_date).toLocaleDateString("en-MY", { year: "numeric", month: "long", day: "numeric" })}</div>
            </div>
            <div className="flex border mb-0.5">
              <div className="w-2/5 bg-neutral-50 px-2 py-1">{DOC_NUMBER_LABEL[invoice.doc_type]}:</div>
              <div className="w-3/5 px-2 py-1">{invoice.invoice_no}</div>
            </div>
            {isInvoice && invoice.due_date && (
              <div className="flex border">
                <div className="w-2/5 bg-neutral-50 px-2 py-1">Due:</div>
                <div className="w-3/5 px-2 py-1">{new Date(invoice.due_date).toLocaleDateString("en-MY", { year: "numeric", month: "long", day: "numeric" })}</div>
              </div>
            )}
          </div>
        </div>

        <table className="w-full text-sm mt-6 border">
          <thead>
            <tr className="bg-[#1f4e79] text-white">
              <th className="text-left font-medium px-2 py-1.5">Description</th>
              <th className="text-right font-medium px-2 py-1.5 w-40">Line Total (RM)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className={i % 2 === 0 ? "bg-white" : "bg-neutral-50"}>
                <td className="px-2 py-1.5">{it.description}</td>
                <td className="px-2 py-1.5 text-right">{it.line_total != null ? formatRM(it.line_total) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-start mt-6 gap-6">
          <div className="w-3/5">
            <div className="bg-[#1f4e79] text-white text-sm font-medium px-2 py-1">Special Notes and Instructions</div>
            <div className="border border-t-0 px-2 py-2 text-sm min-h-16">
              {invoice.bank_account && <p>{invoice.bank_account} {invoice.bank_name}</p>}
              {invoice.special_notes && <p className="mt-1">{invoice.special_notes}</p>}
            </div>
          </div>
          <div className="w-2/5 text-sm space-y-1">
            <div className="flex justify-between border-b py-1"><span>Subtotal</span><span>RM {formatRM(subtotal)}</span></div>
            <div className="flex justify-between border-b py-1"><span>Sales Tax Rate</span><span>{invoice.sales_tax_rate}%</span></div>
            <div className="flex justify-between border-b py-1"><span>Sales Tax</span><span>RM {formatRM(salesTax)}</span></div>
            <div className="flex justify-between border-b py-1"><span>Discount</span><span>RM {formatRM(invoice.discount)}</span></div>
            <div className="flex justify-between font-semibold border-t pt-2"><span>Total</span><span>RM {formatRM(total)}</span></div>
          </div>
        </div>

        <div className="text-center text-xs text-neutral-600 mt-8 space-y-1">
          <p>{docFooter(invoice.doc_type).line1}</p>
          <p className="font-semibold text-sm text-black">{docFooter(invoice.doc_type).thanks}</p>
          <p>{docFooter(invoice.doc_type).enquiry}</p>
          <hr className="my-2" />
          <p>{COMPANY.address}</p>
          <p>Tel: {COMPANY.tel} Fax: - E-mail: {COMPANY.email} Web: -</p>
        </div>
      </div>

      {isInvoice && (
        <PaymentDialog
          mode={payMode ?? "payment"}
          invoice={{ id: invoice.id, invoice_no: invoice.invoice_no, total, balance: remaining, paid: paidTotal }}
          open={payMode !== null}
          onOpenChange={(o) => !o && setPayMode(null)}
          onSaved={load}
        />
      )}
    </>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p className={cn("text-lg font-semibold", highlight && "text-red-700")}>RM {formatRM(value)}</p>
    </div>
  );
}
