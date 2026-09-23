"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { deletePayment } from "@/lib/queries/finance";
import { ATTACHMENT_ACCEPT, openAttachment, removeAttachment, uploadPaymentSlip } from "@/lib/attachments";
import { PAYMENT_METHOD_LABEL, formatDate } from "@/lib/labels";
import { formatRM } from "@/lib/company";
import { cn } from "@/lib/utils";
import type { Payment } from "@/lib/types";

export type PaymentListRow = Payment & { invoices?: { invoice_no: string; bill_to_name?: string } | null };

// Table of payments and refunds. Used on the invoice detail (single invoice)
// and the project finance tab (all invoices of a project, with the invoice column).
export function PaymentsList({
  payments,
  showInvoice = false,
  canDelete = true,
  onChanged,
  emptyText = "No payments recorded yet.",
}: {
  payments: PaymentListRow[];
  showInvoice?: boolean;
  canDelete?: boolean;
  onChanged?: () => void;
  emptyText?: string;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [slipBusyId, setSlipBusyId] = useState<string | null>(null);

  async function remove(p: PaymentListRow) {
    if (busyId) return;
    const what = p.kind === "refund" ? "refund" : "payment";
    const slipText = p.slip_path ? " Its slip is deleted too." : "";
    const receiptText = p.kind === "refund" ? "" : " The linked receipt (if any) is kept.";
    if (!confirm(`Delete this ${what} of RM ${formatRM(Number(p.amount))}?${receiptText}${slipText}`)) return;
    setBusyId(p.id);
    const res = await deletePayment(p.id);
    if (!res.error && p.slip_path) await removeAttachment(p.slip_path);
    setBusyId(null);
    if (res.error) return toast.error(res.error);
    toast.success(p.kind === "refund" ? "Refund deleted." : "Payment deleted.");
    onChanged?.();
  }

  async function attachSlip(p: PaymentListRow, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || slipBusyId) return;
    setSlipBusyId(p.id);
    const res = await uploadPaymentSlip(p, file);
    setSlipBusyId(null);
    if (res.error) return toast.error(res.error);
    toast.success("Slip attached.");
    onChanged?.();
  }

  async function viewSlip(path: string) {
    const err = await openAttachment(path);
    if (err) toast.error(err);
  }

  if (payments.length === 0) return <p className="text-sm text-neutral-500">{emptyText}</p>;

  const signed = (p: PaymentListRow) => (p.kind === "refund" ? -1 : 1) * Number(p.amount);
  const total = payments.reduce((s, p) => s + signed(p), 0);
  const hasRefunds = payments.some((p) => p.kind === "refund");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 border-b text-left">
          <tr>
            <th className="p-2 font-medium">Date</th>
            {showInvoice && <th className="p-2 font-medium">Invoice</th>}
            <th className="p-2 font-medium">Method</th>
            <th className="p-2 font-medium">Reference</th>
            <th className="p-2 font-medium text-right">Amount (RM)</th>
            <th className="p-2 font-medium">Bank</th>
            <th className="p-2 font-medium">Receipt</th>
            <th className="p-2 font-medium">Slip</th>
            {canDelete && <th className="p-2"></th>}
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => {
            const isRefund = p.kind === "refund";
            return (
              <tr key={p.id} className="border-b last:border-0">
                <td className="p-2 whitespace-nowrap">{formatDate(p.paid_on)}</td>
                {showInvoice && (
                  <td className="p-2">
                    <Link href={`/invoices/${p.invoice_id}`} className="hover:underline font-medium">
                      {p.invoices?.invoice_no ?? "Invoice"}
                    </Link>
                  </td>
                )}
                <td className="p-2 whitespace-nowrap">
                  {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                  {isRefund && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">Refund</span>}
                </td>
                <td className="p-2 text-neutral-600">
                  {p.reference || <span className="text-neutral-300">—</span>}
                  {p.note && <span className="block text-xs text-neutral-400">{p.note}</span>}
                </td>
                <td className={cn("p-2 text-right font-medium whitespace-nowrap", isRefund && "text-red-700")}>
                  {isRefund ? "-" : ""}
                  {formatRM(Number(p.amount))}
                </td>
                <td className="p-2 whitespace-nowrap">
                  {p.bank_transaction_id ? (
                    <Link
                      href={`/expenses/received?txn=${p.bank_transaction_id}&year=${p.paid_on.slice(0, 4)}`}
                      className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800 hover:underline"
                      title="Matched to a line on the bank statement"
                    >
                      Matched
                    </Link>
                  ) : (
                    <span className="text-xs text-neutral-400" title="Not yet matched to a bank statement line">Not matched</span>
                  )}
                </td>
                <td className="p-2">
                  {p.receipt_id ? (
                    <Link href={`/receipts/${p.receipt_id}`} className="text-xs text-neutral-600 hover:underline">View receipt</Link>
                  ) : (
                    <span className="text-xs text-neutral-300">—</span>
                  )}
                </td>
                <td className="p-2 whitespace-nowrap">
                  {p.slip_path ? (
                    <button onClick={() => viewSlip(p.slip_path!)} className="text-xs text-neutral-600 hover:underline">
                      View slip
                    </button>
                  ) : (
                    <label
                      className={cn(
                        "text-xs text-neutral-500 hover:underline cursor-pointer",
                        slipBusyId === p.id && "opacity-50 pointer-events-none"
                      )}
                    >
                      {slipBusyId === p.id ? "Uploading..." : "Attach slip"}
                      <input type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={(e) => attachSlip(p, e)} />
                    </label>
                  )}
                </td>
                {canDelete && (
                  <td className="p-2 text-right">
                    <button onClick={() => remove(p)} disabled={busyId === p.id} className="text-xs text-red-500 hover:underline disabled:opacity-50">
                      {busyId === p.id ? "..." : "Delete"}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t bg-neutral-50 font-medium">
          <tr>
            <td className="p-2" colSpan={showInvoice ? 4 : 3}>{hasRefunds ? "Net received" : "Total received"}</td>
            <td className="p-2 text-right">{formatRM(total)}</td>
            <td colSpan={canDelete ? 4 : 3}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
