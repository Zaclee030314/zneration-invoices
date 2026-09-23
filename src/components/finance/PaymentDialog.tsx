"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { duplicateDocument, voidDocument } from "@/lib/documents";
import { createPayment, updatePayment } from "@/lib/queries/finance";
import { ATTACHMENT_ACCEPT, attachmentProblem, uploadPaymentSlip } from "@/lib/attachments";
import { PAYMENT_METHODS, todayIso } from "@/lib/labels";
import { formatRM } from "@/lib/company";
import { useWorkspace } from "@/lib/workspace";
import type { InvoiceWithItems, PaymentKind, PaymentMethod } from "@/lib/types";

export type PaymentDialogInvoice = {
  id: string;
  invoice_no: string;
  total: number;
  balance: number;
  paid?: number;
};

// Records a payment against an invoice, optionally generating a receipt (a
// copy of the invoice in the receipt series, dated on the payment day). In
// refund mode it records money returned to the client instead, optionally
// voiding the invoice when the job was cancelled.
export function PaymentDialog({
  invoice,
  open,
  onOpenChange,
  onSaved,
  mode = "payment",
}: {
  invoice: PaymentDialogInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  mode?: PaymentKind;
}) {
  const isRefund = mode === "refund";
  const { company } = useWorkspace();
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [slip, setSlip] = useState<File | null>(null);
  const [slipInputKey, setSlipInputKey] = useState(0);
  const [generateReceipt, setGenerateReceipt] = useState(true);
  const [receiptTouched, setReceiptTouched] = useState(false);
  const [voidInvoice, setVoidInvoice] = useState(false);
  const [saving, setSaving] = useState(false);

  const remaining = Math.max(0, Number(invoice?.balance ?? 0));
  const refundable = Math.max(0, Number(invoice?.paid ?? 0));
  const amountNum = parseFloat(amount) || 0;
  const settles = invoice && !isRefund ? amountNum >= remaining - 0.005 && remaining > 0 : false;

  // Reset the form each time the dialog opens for an invoice.
  useEffect(() => {
    if (!open || !invoice) return;
    const start = isRefund ? refundable : remaining;
    setAmount(start > 0 ? start.toFixed(2) : "");
    setPaidOn(todayIso());
    setMethod("bank_transfer");
    setReference("");
    setNote("");
    setSlip(null);
    setSlipInputKey((k) => k + 1);
    setGenerateReceipt(!isRefund && remaining > 0);
    setReceiptTouched(false);
    setVoidInvoice(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id, mode]);

  // Default the receipt checkbox to "on" when this payment settles the balance,
  // unless the user has already toggled it by hand.
  useEffect(() => {
    if (!receiptTouched && !isRefund) setGenerateReceipt(settles);
  }, [settles, receiptTouched, isRefund]);

  function pickSlip(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    const problem = file ? attachmentProblem(file) : null;
    if (problem) {
      toast.error(problem);
      setSlip(null);
      setSlipInputKey((k) => k + 1);
      return;
    }
    setSlip(file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || saving) return;
    if (!(amountNum > 0)) return toast.error("Amount must be greater than zero.");
    if (!paidOn) return toast.error(isRefund ? "Refund date is required." : "Payment date is required.");
    if (isRefund && amountNum > refundable + 0.005) return toast.error(`You can refund at most RM ${formatRM(refundable)} (what has been paid).`);
    setSaving(true);

    const created = await createPayment({
      invoice_id: invoice.id,
      // Payments rely on the column default so recording them keeps working before migration 008 is applied.
      ...(isRefund ? { kind: "refund" as const } : {}),
      amount: Math.round(amountNum * 100) / 100,
      paid_on: paidOn,
      method,
      reference: reference.trim() || null,
      note: note.trim() || null,
    });
    if (created.error || !created.data) {
      setSaving(false);
      return toast.error(created.error ?? (isRefund ? "Could not record refund." : "Could not record payment."));
    }

    let slipMsg = "";
    if (slip) {
      const uploaded = await uploadPaymentSlip(created.data, slip);
      slipMsg = uploaded.error ? ` Slip not attached: ${uploaded.error}` : " Slip attached.";
    }

    let extraMsg = "";
    if (isRefund && voidInvoice) {
      const voided = await voidDocument(invoice.id);
      extraMsg = voided.error ? ` Invoice not voided: ${voided.error}` : " Invoice voided.";
    }
    if (!isRefund && generateReceipt) {
      const { data: full } = await supabase.from("invoices").select("*, invoice_items(*)").eq("id", invoice.id).maybeSingle();
      if (full) {
        const res = await duplicateDocument(full as InvoiceWithItems, { docType: "receipt", date: paidOn, series: company.series });
        if ("error" in res) extraMsg = ` Receipt failed: ${res.error}`;
        else {
          const linked = await updatePayment(created.data.id, { receipt_id: res.id });
          extraMsg = linked.error ? ` Receipt created but not linked: ${linked.error}` : " Receipt generated.";
        }
      } else {
        extraMsg = " Receipt skipped: could not load the invoice.";
      }
    }

    setSaving(false);
    toast.success(`${isRefund ? "Refund" : "Payment"} of RM ${formatRM(amountNum)} recorded for ${invoice.invoice_no}.${slipMsg}${extraMsg}`);
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{isRefund ? "Record refund" : "Record payment"}</DialogTitle>
            <DialogDescription>
              {!invoice ? (
                "No invoice selected."
              ) : isRefund ? (
                <>
                  {invoice.invoice_no} · paid RM {formatRM(refundable)} · money returned to the client
                </>
              ) : (
                <>
                  {invoice.invoice_no} · total RM {formatRM(Number(invoice.total))} · balance RM {formatRM(remaining)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500">{isRefund ? "Refund amount (RM)" : "Amount (RM)"}</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="w-full border rounded px-3 py-2 text-sm"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500">{isRefund ? "Refunded on" : "Paid on"}</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2 text-sm"
                value={paidOn}
                onChange={(e) => setPaidOn(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500">Method</label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-neutral-500">Reference</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="Transaction ID, cheque no."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500">Note</label>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm"
              rows={2}
              placeholder={isRefund ? "Reason for the refund" : undefined}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-neutral-500">{isRefund ? "Refund slip" : "Payment slip"}</label>
            <input
              key={slipInputKey}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              onChange={pickSlip}
              className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-neutral-700 hover:file:bg-neutral-50"
            />
            <p className="mt-1 text-xs text-neutral-400">Photo or PDF of the transfer, up to 10 MB.</p>
          </div>

          {isRefund ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={voidInvoice} onChange={(e) => setVoidInvoice(e.target.checked)} />
              <span>
                Void this invoice
                <span className="block text-xs text-neutral-400">Tick if the job was cancelled. Otherwise the refunded amount shows as owed again.</span>
              </span>
            </label>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={generateReceipt}
                onChange={(e) => {
                  setReceiptTouched(true);
                  setGenerateReceipt(e.target.checked);
                }}
              />
              Generate receipt
              {settles && <span className="text-xs text-neutral-400">(settles the balance)</span>}
            </label>
          )}

          {!isRefund && amountNum > remaining + 0.005 && remaining > 0 && (
            <p className="text-xs text-amber-700">This is more than the outstanding balance (RM {formatRM(remaining)}).</p>
          )}

          <DialogFooter>
            <button type="button" onClick={() => onOpenChange(false)} disabled={saving} className="border rounded px-3 py-1.5 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving || !invoice} className="bg-neutral-900 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
              {saving ? "Saving..." : isRefund ? "Record refund" : "Record payment"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
