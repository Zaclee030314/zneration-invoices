"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { duplicateDocument } from "@/lib/documents";
import { createPayment, updatePayment } from "@/lib/queries/finance";
import { PAYMENT_METHODS, todayIso } from "@/lib/labels";
import { formatRM } from "@/lib/company";
import type { InvoiceWithItems, PaymentMethod } from "@/lib/types";

export type PaymentDialogInvoice = {
  id: string;
  invoice_no: string;
  total: number;
  balance: number;
};

// Records a payment against an invoice, optionally generating a receipt (a
// copy of the invoice in the receipt series, dated on the payment day).
export function PaymentDialog({
  invoice,
  open,
  onOpenChange,
  onSaved,
}: {
  invoice: PaymentDialogInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [generateReceipt, setGenerateReceipt] = useState(true);
  const [receiptTouched, setReceiptTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const remaining = Math.max(0, Number(invoice?.balance ?? 0));
  const amountNum = parseFloat(amount) || 0;
  const settles = invoice ? amountNum >= remaining - 0.005 && remaining > 0 : false;

  // Reset the form each time the dialog opens for an invoice.
  useEffect(() => {
    if (!open || !invoice) return;
    setAmount(remaining > 0 ? remaining.toFixed(2) : "");
    setPaidOn(todayIso());
    setMethod("bank_transfer");
    setReference("");
    setNote("");
    setGenerateReceipt(remaining > 0);
    setReceiptTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id]);

  // Default the receipt checkbox to "on" when this payment settles the balance,
  // unless the user has already toggled it by hand.
  useEffect(() => {
    if (!receiptTouched) setGenerateReceipt(settles);
  }, [settles, receiptTouched]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || saving) return;
    if (!(amountNum > 0)) return toast.error("Amount must be greater than zero.");
    if (!paidOn) return toast.error("Payment date is required.");
    setSaving(true);

    const created = await createPayment({
      invoice_id: invoice.id,
      amount: Math.round(amountNum * 100) / 100,
      paid_on: paidOn,
      method,
      reference: reference.trim() || null,
      note: note.trim() || null,
    });
    if (created.error || !created.data) {
      setSaving(false);
      return toast.error(created.error ?? "Could not record payment.");
    }

    let receiptMsg = "";
    if (generateReceipt) {
      const { data: full } = await supabase.from("invoices").select("*, invoice_items(*)").eq("id", invoice.id).maybeSingle();
      if (full) {
        const res = await duplicateDocument(full as InvoiceWithItems, { docType: "receipt", date: paidOn });
        if ("error" in res) receiptMsg = ` Receipt failed: ${res.error}`;
        else {
          const linked = await updatePayment(created.data.id, { receipt_id: res.id });
          receiptMsg = linked.error ? ` Receipt created but not linked: ${linked.error}` : " Receipt generated.";
        }
      } else {
        receiptMsg = " Receipt skipped: could not load the invoice.";
      }
    }

    setSaving(false);
    toast.success(`Payment of RM ${formatRM(amountNum)} recorded for ${invoice.invoice_no}.${receiptMsg}`);
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              {invoice ? (
                <>
                  {invoice.invoice_no} · total RM {formatRM(Number(invoice.total))} · balance RM {formatRM(remaining)}
                </>
              ) : (
                "No invoice selected."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500">Amount (RM)</label>
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
              <label className="text-xs text-neutral-500">Paid on</label>
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
            <textarea className="w-full border rounded px-3 py-2 text-sm" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

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

          {amountNum > remaining + 0.005 && remaining > 0 && (
            <p className="text-xs text-amber-700">This is more than the outstanding balance (RM {formatRM(remaining)}).</p>
          )}

          <DialogFooter>
            <button type="button" onClick={() => onOpenChange(false)} disabled={saving} className="border rounded px-3 py-1.5 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving || !invoice} className="bg-neutral-900 text-white rounded px-3 py-1.5 text-sm disabled:opacity-50">
              {saving ? "Saving..." : "Record payment"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
