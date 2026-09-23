"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { BankTransactionRow } from "@/lib/types";
import { formatDate } from "@/lib/labels";
import { currentYymm, formatRM } from "@/lib/company";
import { supabase } from "@/lib/supabase/client";
import { methodFor } from "@/lib/queries/receipts";
import { useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const cents = (n: number) => Math.round(Number(n) * 100);

function dateRange(from: string, to: string): string {
  if (from === to) return formatDate(from);
  const [a, b] = [new Date(`${from}T00:00:00`), new Date(`${to}T00:00:00`)];
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return sameMonth ? `${a.getDate()}–${formatDate(to)}` : `${formatDate(from)} – ${formatDate(to)}`;
}

// Turns many small bank credits (walk-in and bazaar sales) into one sales
// invoice, with each credit recorded as a payment against it, so the sales list
// has one paid record per event and every credit shows as matched.
export function CombineSalesDialog({
  open,
  onOpenChange,
  credits,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credits: BankTransactionRow[];
  onDone: () => void;
}) {
  const router = useRouter();
  const { company } = useWorkspace();
  const sorted = useMemo(() => [...credits].sort((a, b) => a.txn_date.localeCompare(b.txn_date)), [credits]);
  const first = sorted[0]?.txn_date ?? "";
  const last = sorted[sorted.length - 1]?.txn_date ?? "";
  const totalCents = sorted.reduce((s, c) => s + cents(c.amount), 0);
  const commonTag = sorted.every((c) => c.tag && c.tag === sorted[0].tag) ? sorted[0].tag : null;
  const problem = !sorted.length
    ? "Select the payments to combine."
    : sorted.some((c) => cents(c.linked_total) > 0)
      ? "Some selected payments are already linked to an invoice. Unselect them first."
      : sorted.some((c) => c.category === "own_transfer" || c.category === "loan_advance")
        ? "Own-account transfers and loans are not sales. Unselect them first."
        : null;

  const [series, setSeries] = useState("");
  const [billTo, setBillTo] = useState("");
  const [description, setDescription] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [tag, setTag] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !sorted.length) return;
    const accounts = sorted.map((c) => c.account_no);
    const main = accounts.sort((a, b) => accounts.filter((x) => x === b).length - accounts.filter((x) => x === a).length)[0];
    setSeries((company.series.find((s) => s.bankAccount === main) ?? company.series[0])?.key ?? "");
    setBillTo("Walk-in customers");
    setTag(commonTag ?? "");
    setDescription(`Product sales${commonTag ? ` at ${commonTag}` : ""}, ${dateRange(first, last)} (${sorted.length} payment${sorted.length === 1 ? "" : "s"})`);
    setInvoiceDate(first);
    // Defaults are set each time the dialog opens for a new selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function create() {
    if (problem || saving) return;
    if (!series) return toast.error("This company has no invoice series. Add one in Settings → Company.");
    if (!billTo.trim() || !description.trim() || !invoiceDate) return toast.error("Fill in who it is billed to, the description and the date.");
    if (invoiceDate > first) return toast.error(`The invoice date must be on or before the first payment (${formatDate(first)}).`);
    setSaving(true);
    const seriesInfo = company.series.find((s) => s.key === series);
    const { data: number, error: numErr } = await supabase.rpc("next_invoice_no", { p_category: series, p_yymm: currentYymm(new Date(invoiceDate)) });
    if (numErr || !number) {
      setSaving(false);
      return toast.error(numErr?.message ?? "Could not reserve an invoice number.");
    }
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .insert({
        doc_type: "invoice",
        category: series,
        invoice_no: number,
        bill_to_name: billTo.trim(),
        invoice_date: invoiceDate,
        due_date: invoiceDate,
        bank_name: seriesInfo?.bankName || null,
        bank_account: seriesInfo?.bankAccount || null,
        sales_tax_rate: 0,
        discount: 0,
        special_notes: `Combined from ${sorted.length} payment${sorted.length === 1 ? "" : "s"} received ${dateRange(first, last)}.`,
      })
      .select("id")
      .single();
    if (invErr || !invoice) {
      setSaving(false);
      return toast.error(invErr?.message ?? "Could not create the invoice.");
    }
    // Anything failing from here removes the invoice again (its items and payments go with it).
    const undo = async (message: string) => {
      await supabase.from("invoices").delete().eq("id", invoice.id);
      setSaving(false);
      toast.error(message);
    };
    const { error: itemErr } = await supabase
      .from("invoice_items")
      .insert({ invoice_id: invoice.id, description: description.trim(), line_total: totalCents / 100, sort_order: 0 });
    if (itemErr) return undo(itemErr.message);
    const { error: payErr } = await supabase.from("payments").insert(
      sorted.map((c) => ({
        invoice_id: invoice.id,
        amount: cents(c.amount) / 100,
        paid_on: c.txn_date,
        method: methodFor(c),
        reference: (c.counterparty || c.reference || "").slice(0, 200) || null,
        bank_transaction_id: c.id,
      }))
    );
    if (payErr) return undo(payErr.message);
    const { error: tagErr } = await supabase
      .from("bank_transactions")
      .update({ category: "product_sales", category_source: "user", tag: tag.trim() || null, project_id: null })
      .in("id", sorted.map((c) => c.id));
    setSaving(false);
    toast.success(`${number} created for RM ${formatRM(totalCents / 100)}, paid by ${sorted.length} payment${sorted.length === 1 ? "" : "s"}.${tagErr ? ` Category not set: ${tagErr.message}` : ""}`, {
      action: { label: "Open", onClick: () => router.push(`/invoices/${invoice.id}`) },
    });
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Combine into one sales record</DialogTitle>
          <DialogDescription>
            Creates one paid invoice for these {sorted.length} payment{sorted.length === 1 ? "" : "s"} (RM {formatRM(totalCents / 100)}, {first && dateRange(first, last)}), with
            each bank payment recorded against it. Use it for walk-in and bazaar product sales that have no invoice of their own.
          </DialogDescription>
        </DialogHeader>

        {problem ? (
          <p className="text-sm text-red-700">{problem}</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice series">
                <select className="h-9 w-full rounded border bg-white px-2 text-sm" value={series} onChange={(e) => setSeries(e.target.value)}>
                  {company.series.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.key} · {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Invoice date">
                <Input type="date" value={invoiceDate} max={first} onChange={(e) => setInvoiceDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Bill to">
              <Input value={billTo} onChange={(e) => setBillTo(e.target.value)} />
            </Field>
            <Field label="Description">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label="Event or tag for these payments (optional)">
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Megah Rise Mall Aug 2026" />
            </Field>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={create} disabled={!!problem || saving}>
            {saving ? "Creating..." : `Create invoice for RM ${formatRM(totalCents / 100)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-neutral-500">{label}</Label>
      {children}
    </div>
  );
}
