"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { deletePayment } from "@/lib/queries/finance";
import { PAYMENT_METHOD_LABEL, formatDate } from "@/lib/labels";
import { formatRM } from "@/lib/company";
import type { Payment } from "@/lib/types";

export type PaymentListRow = Payment & { invoices?: { invoice_no: string; bill_to_name?: string } | null };

// Table of payments. Used on the invoice detail (single invoice) and the
// project finance tab (all invoices of a project, with the invoice column).
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

  async function remove(p: PaymentListRow) {
    if (busyId) return;
    if (!confirm(`Delete this payment of RM ${formatRM(Number(p.amount))}? The linked receipt (if any) is kept.`)) return;
    setBusyId(p.id);
    const res = await deletePayment(p.id);
    setBusyId(null);
    if (res.error) return toast.error(res.error);
    toast.success("Payment deleted.");
    onChanged?.();
  }

  if (payments.length === 0) return <p className="text-sm text-neutral-500">{emptyText}</p>;

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

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
            <th className="p-2 font-medium">Receipt</th>
            {canDelete && <th className="p-2"></th>}
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b last:border-0">
              <td className="p-2 whitespace-nowrap">{formatDate(p.paid_on)}</td>
              {showInvoice && (
                <td className="p-2">
                  <Link href={`/invoices/${p.invoice_id}`} className="hover:underline font-medium">
                    {p.invoices?.invoice_no ?? "Invoice"}
                  </Link>
                </td>
              )}
              <td className="p-2">{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</td>
              <td className="p-2 text-neutral-600">
                {p.reference || <span className="text-neutral-300">—</span>}
                {p.note && <span className="block text-xs text-neutral-400">{p.note}</span>}
              </td>
              <td className="p-2 text-right font-medium">{formatRM(Number(p.amount))}</td>
              <td className="p-2">
                {p.receipt_id ? (
                  <Link href={`/receipts/${p.receipt_id}`} className="text-xs text-neutral-600 hover:underline">View receipt</Link>
                ) : (
                  <span className="text-xs text-neutral-300">—</span>
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
          ))}
        </tbody>
        <tfoot className="border-t bg-neutral-50 font-medium">
          <tr>
            <td className="p-2" colSpan={showInvoice ? 4 : 3}>Total received</td>
            <td className="p-2 text-right">{formatRM(total)}</td>
            <td colSpan={canDelete ? 2 : 1}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
