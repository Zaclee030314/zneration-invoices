"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FilePlus2, Link2, Search, Unlink } from "lucide-react";
import type { BankTag, BankTransactionRow, InvoiceWithItems, TxnCategory } from "@/lib/types";
import { formatDate } from "@/lib/labels";
import { formatRM } from "@/lib/company";
import { payeeLabel } from "@/lib/expenses";
import { suggestForCredit, type MatchInvoice, type MatchPayment, type Suggestion } from "@/lib/receipts";
import { supabase } from "@/lib/supabase/client";
import { duplicateDocument } from "@/lib/documents";
import { createPayment, deletePayment, updatePayment } from "@/lib/queries/finance";
import { linkPayment, methodFor, toMatchCredit, unlinkPayment, type LinkedPayment } from "@/lib/queries/receipts";
import type { TransactionPatch } from "@/lib/queries/expenses";
import { useWorkspace } from "@/lib/workspace";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BankLineDetails } from "./BankLineDetails";
import { CategorySelect } from "./CategorySelect";
import { ExpenseStatusBadge } from "./ExpenseStatusBadge";
import { TagProjectPicker, type PickerProject } from "./TagProjectPicker";

const cents = (n: number) => Math.round(Number(n) * 100);

// Right-hand sheet for one bank credit: which invoices it paid, suggestions for
// the ones it probably paid, and how it is classified when it is not an invoice payment.
export function ReceivedSheet({
  row,
  linked,
  payments,
  invoices,
  projects,
  tags,
  onClose,
  onPatch,
  onCategory,
  onChanged,
}: {
  row: BankTransactionRow | null;
  linked: LinkedPayment[];
  payments: MatchPayment[];
  invoices: MatchInvoice[];
  projects: PickerProject[];
  tags: BankTag[];
  onClose: () => void;
  onPatch: (patch: TransactionPatch) => Promise<boolean>;
  onCategory: (category: TxnCategory | null) => void;
  onChanged: () => Promise<void>;
}) {
  const { company } = useWorkspace();
  const [explanation, setExplanation] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Suggestion | null>(null);
  const [amount, setAmount] = useState("");
  const [withReceipt, setWithReceipt] = useState(false);
  const [busy, setBusy] = useState(false);
  const rowId = row?.id;

  useEffect(() => {
    setExplanation(row?.explanation ?? "");
    setQuery("");
    setTarget(null);
    // Reset drafts only when another bank line is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId]);

  const linkedTotal = linked.reduce((s, p) => s + cents(p.amount), 0);
  const remaining = row ? cents(row.amount) - linkedTotal : 0;
  const credit = useMemo(() => (row ? { ...toMatchCredit(row), linked_total: linkedTotal / 100 } : null), [row, linkedTotal]);
  const suggestions = useMemo(() => (credit ? suggestForCredit(credit, payments, invoices) : []), [credit, payments, invoices]);

  const searchResults = useMemo<Suggestion[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q || remaining <= 0) return [];
    const hit = (no: string, name: string) => no.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    const fromPayments: Suggestion[] = payments
      .filter((p) => cents(p.amount) <= remaining && hit(p.invoice_no, p.bill_to_name))
      .map((p) => ({ kind: "payment", invoiceId: p.invoice_id, invoiceNo: p.invoice_no, billTo: p.bill_to_name, amount: Number(p.amount), payment: p, score: 0, why: `recorded payment on ${formatDate(p.paid_on)}` }));
    const fromInvoices: Suggestion[] = invoices
      .filter((i) => Number(i.balance) > 0 && i.status !== "void" && i.status !== "refunded" && hit(i.invoice_no, i.bill_to_name))
      .map((i) => ({ kind: "invoice", invoiceId: i.id, invoiceNo: i.invoice_no, billTo: i.bill_to_name, amount: Math.min(Number(i.balance), remaining / 100), score: 0, why: `RM ${formatRM(Number(i.balance))} still owed` }));
    return [...fromPayments, ...fromInvoices].slice(0, 10);
  }, [query, payments, invoices, remaining]);

  function choose(s: Suggestion) {
    setTarget(s);
    setAmount(s.amount.toFixed(2));
    const inv = invoices.find((i) => i.id === s.invoiceId);
    setWithReceipt(s.kind === "invoice" && !!inv && cents(s.amount) >= cents(inv.balance));
  }

  async function confirmLink() {
    if (!row || !target || busy) return;
    setBusy(true);
    try {
      if (target.kind === "payment" && target.payment) {
        const res = await linkPayment(target.payment.id, row.id);
        if (res.error !== null) return void toast.error(res.error);
        toast.success(`Linked to the payment recorded on ${target.invoiceNo}.`);
      } else {
        const value = Math.round((parseFloat(amount) || 0) * 100);
        if (value <= 0) return void toast.error("Enter the amount this transfer paid on the invoice.");
        if (value > remaining) return void toast.error(`Only RM ${formatRM(remaining / 100)} of this transfer is still unlinked.`);
        const created = await createPayment({
          invoice_id: target.invoiceId,
          amount: value / 100,
          paid_on: row.txn_date,
          method: methodFor(row),
          reference: (row.reference || row.counterparty || "").slice(0, 200) || null,
          note: null,
          bank_transaction_id: row.id,
        });
        if (created.error !== null || !created.data) return void toast.error(created.error ?? "Could not record the payment.");
        let extra = "";
        if (withReceipt) {
          const { data: full } = await supabase.from("invoices").select("*, invoice_items(*)").eq("id", target.invoiceId).maybeSingle();
          const receipt = full ? await duplicateDocument(full as InvoiceWithItems, { docType: "receipt", date: row.txn_date, series: company.series }) : { error: "invoice not found" };
          if ("error" in receipt) extra = ` Receipt not created: ${receipt.error}`;
          else {
            await updatePayment(created.data.id, { receipt_id: receipt.id });
            extra = " Receipt created.";
          }
        }
        toast.success(`Recorded RM ${formatRM(value / 100)} on ${target.invoiceNo}.${extra}`);
      }
      setTarget(null);
      setQuery("");
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function unlink(p: LinkedPayment) {
    if (busy) return;
    setBusy(true);
    const res = await unlinkPayment(p.id);
    setBusy(false);
    if (res.error !== null) return toast.error(res.error);
    toast.success(`Unlinked. The payment stays recorded on ${p.invoice_no}.`);
    await onChanged();
  }

  async function removePayment(p: LinkedPayment) {
    if (busy || !confirm(`Delete the RM ${formatRM(p.amount)} payment recorded on ${p.invoice_no}? The invoice shows the amount as owed again. Its receipt, if any, is kept.`)) return;
    setBusy(true);
    const res = await deletePayment(p.id);
    setBusy(false);
    if (res.error !== null) return toast.error(res.error);
    toast.success("Payment deleted.");
    await onChanged();
  }

  async function saveExplanation() {
    setSavingNote(true);
    const ok = await onPatch({ explanation: explanation.trim() || null });
    setSavingNote(false);
    if (ok) toast.success(explanation.trim() ? "Explanation saved" : "Explanation removed");
  }

  const options = query.trim() ? searchResults : suggestions;

  return (
    <Sheet open={!!row} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        {row && (
          <div className="flex min-h-full flex-col">
            <SheetHeader className="space-y-1 border-b px-6 pt-6 pb-3">
              <SheetTitle className="pr-6 text-base">{payeeLabel(row)}</SheetTitle>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600">
                <span className="text-lg font-semibold text-emerald-700">+ RM {formatRM(Number(row.amount))}</span>
                <span>{formatDate(row.txn_date)}</span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{row.account_label}</span>
                <ExpenseStatusBadge status={row.status} />
              </div>
              {linkedTotal > 0 && (
                <p className="text-xs text-neutral-500">
                  RM {formatRM(linkedTotal / 100)} linked to invoices{remaining > 0 ? `, RM ${formatRM(remaining / 100)} not linked` : ""}
                </p>
              )}
            </SheetHeader>

            <div className="space-y-6 px-6 py-4 text-sm">
              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Invoices paid by this transfer</h3>
                {linked.length === 0 ? (
                  <p className="text-neutral-500">Not linked to any invoice yet.</p>
                ) : (
                  <ul className="divide-y rounded border bg-white">
                    {linked.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 p-2">
                        <div className="min-w-0 flex-1">
                          <Link href={`/invoices/${p.invoice_id}`} className="font-medium hover:underline">
                            {p.invoice_no}
                          </Link>
                          <span className="ml-2 text-neutral-500">{p.bill_to_name}</span>
                          {p.receipt_id && (
                            <Link href={`/receipts/${p.receipt_id}`} className="ml-2 text-xs text-neutral-500 hover:underline">
                              receipt
                            </Link>
                          )}
                        </div>
                        <span className="tabular-nums">RM {formatRM(p.amount)}</span>
                        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => unlink(p)} title="Unlink; the payment stays on the invoice">
                          <Unlink />
                        </Button>
                        <button type="button" disabled={busy} onClick={() => removePayment(p)} className="text-xs text-red-500 hover:underline disabled:opacity-50">
                          Delete payment
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {remaining > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Link to an invoice</h3>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 size-4 text-neutral-400" />
                    <Input className="pl-8" placeholder="Search invoice number or client" value={query} onChange={(e) => setQuery(e.target.value)} />
                  </div>
                  {!query.trim() && options.length > 0 && <p className="text-xs text-neutral-500">Suggested from the amount, date and payer name:</p>}
                  {options.length === 0 ? (
                    <p className="text-xs text-neutral-500">
                      {query.trim() ? "No open invoice or unmatched payment matches that." : "No invoice looks like a match. Search above, or create the invoice."}
                    </p>
                  ) : (
                    <ul className="divide-y rounded border bg-white">
                      {options.map((s) => {
                        const chosen = target?.kind === s.kind && (s.payment ? target.payment?.id === s.payment.id : target?.invoiceId === s.invoiceId);
                        return (
                          <li key={`${s.kind}-${s.payment?.id ?? s.invoiceId}`}>
                            <button type="button" onClick={() => choose(s)} className={cn("flex w-full items-start gap-2 p-2 text-left hover:bg-neutral-50", chosen && "bg-neutral-100")}>
                              <Link2 className="mt-0.5 size-4 shrink-0 text-neutral-400" />
                              <span className="min-w-0 flex-1">
                                <span className="font-medium">{s.invoiceNo}</span> <span className="text-neutral-600">{s.billTo}</span>
                                <span className="block text-xs text-neutral-500">
                                  {s.kind === "payment" ? "Payment already recorded" : "Record a payment"} · {s.why}
                                </span>
                              </span>
                              <span className="tabular-nums">RM {formatRM(s.amount)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {target && (
                    <div className="space-y-2 rounded border bg-neutral-50 p-3">
                      {target.kind === "payment" && target.payment ? (
                        <p>
                          Link the RM {formatRM(target.amount)} payment recorded on <span className="font-medium">{target.invoiceNo}</span> on{" "}
                          {formatDate(target.payment.paid_on)} to this bank line.
                        </p>
                      ) : (
                        <>
                          <p>
                            Record a payment on <span className="font-medium">{target.invoiceNo}</span> dated {formatDate(row.txn_date)}, linked to this bank line.
                          </p>
                          <div className="flex flex-wrap items-center gap-3">
                            <Label className="text-xs text-neutral-500">Amount (RM)</Label>
                            <Input type="number" step="0.01" min="0.01" className="w-32" value={amount} onChange={(e) => setAmount(e.target.value)} />
                            <label className="flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={withReceipt} onChange={(e) => setWithReceipt(e.target.checked)} /> Create a receipt
                            </label>
                          </div>
                        </>
                      )}
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={confirmLink} disabled={busy}>
                          {busy ? "Saving..." : target.kind === "payment" ? "Link" : "Record and link"}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setTarget(null)} disabled={busy}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  <Button asChild type="button" variant="outline" size="sm">
                    <Link href={`/invoices/new?bank=${row.id}`}>
                      <FilePlus2 /> Create an invoice for this payment
                    </Link>
                  </Button>
                </section>
              )}

              <section className="space-y-4">
                <Field label="Category">
                  <CategorySelect value={row.category} onChange={onCategory} direction="in" className="h-9 text-sm" muted={row.category_source !== "user"} />
                  <p className="text-xs text-neutral-500">
                    Own transfers, loans, refunds, product sales and other income need no invoice.
                  </p>
                </Field>
                <Field label="Event or tag">
                  <TagProjectPicker projectId={row.project_id} tag={row.tag} projects={projects} tags={tags} onChange={(v) => onPatch(v)} className="px-2.5 py-1.5 text-sm" />
                </Field>
                <Field label="Explanation">
                  <Textarea
                    rows={2}
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder="What was this money for? For example: director top-up, overpayment refunded later."
                  />
                  <div className="flex justify-end">
                    <Button type="button" size="sm" variant="outline" disabled={explanation.trim() === (row.explanation ?? "").trim() || savingNote} onClick={saveExplanation}>
                      {savingNote ? "Saving..." : "Save explanation"}
                    </Button>
                  </div>
                </Field>
              </section>

              <BankLineDetails row={row} />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
