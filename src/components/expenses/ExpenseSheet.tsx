"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import type { BankTag, BankTransactionRow, TxnCategory } from "@/lib/types";
import { formatDate } from "@/lib/labels";
import { formatRM } from "@/lib/company";
import { openAttachment } from "@/lib/attachments";
import { DONE_REASON_LABEL, payeeLabel } from "@/lib/expenses";
import { fetchStatementPath, type TransactionPatch } from "@/lib/queries/expenses";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CategorySelect } from "./CategorySelect";
import { ExpenseDocuments } from "./ExpenseDocuments";
import { ExpenseStatusBadge } from "./ExpenseStatusBadge";
import { TagProjectPicker, type PickerProject } from "./TagProjectPicker";

// Right-hand sheet for one payment: what the bank shows, how the team classifies
// it, and the documents or explanation that back it.
export function ExpenseSheet({
  row,
  onClose,
  projects,
  tags,
  onPatch,
  onCategory,
  onDocCount,
}: {
  row: BankTransactionRow | null;
  onClose: () => void;
  projects: PickerProject[];
  tags: BankTag[];
  onPatch: (patch: TransactionPatch) => Promise<boolean>;
  onCategory: (category: TxnCategory | null) => void;
  onDocCount: (count: number) => void;
}) {
  const [explanation, setExplanation] = useState("");
  const [saving, setSaving] = useState(false);
  const [statementPath, setStatementPath] = useState<string | null>(null);
  const rowId = row?.id;
  const statementId = row?.statement_id;

  useEffect(() => {
    setExplanation(row?.explanation ?? "");
    // Reset the draft only when another payment is opened, not when this one is saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId]);

  useEffect(() => {
    setStatementPath(null);
    if (!statementId) return;
    let cancelled = false;
    fetchStatementPath(statementId).then((res) => {
      if (!cancelled && res.error === null) setStatementPath(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [statementId]);

  const dirty = explanation.trim() !== (row?.explanation ?? "").trim();

  async function saveExplanation() {
    setSaving(true);
    const ok = await onPatch({ explanation: explanation.trim() || null });
    setSaving(false);
    if (ok) toast.success(explanation.trim() ? "Explanation saved" : "Explanation removed");
  }

  async function viewStatement() {
    if (!statementPath) return;
    const error = await openAttachment(statementPath);
    if (error) toast.error(error);
  }

  return (
    <Sheet open={!!row} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        {row && (
          <div className="flex min-h-full flex-col">
            <SheetHeader className="space-y-1 border-b px-6 pt-6 pb-3">
              <SheetTitle className="pr-6 text-base">{payeeLabel(row)}</SheetTitle>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600">
                <span className="text-lg font-semibold text-neutral-900">RM {formatRM(Number(row.amount))}</span>
                <span>{formatDate(row.txn_date)}</span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{row.account_label}</span>
                <ExpenseStatusBadge status={row.status} />
              </div>
              {row.status === "done" && row.done_reason && <p className="text-xs text-neutral-500">{DONE_REASON_LABEL[row.done_reason]}</p>}
            </SheetHeader>

            <div className="space-y-6 px-6 py-4 text-sm">
              <section className="space-y-4">
                <Field label="Category">
                  <CategorySelect value={row.category} onChange={onCategory} className="h-9 text-sm" muted={row.category_source !== "user"} />
                  {row.category && row.category_source !== "user" && (
                    <p className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                      {row.category_source === "history" ? "Suggested from earlier payments to this payee." : "Suggested from the bank description."}
                      <button type="button" className="underline" onClick={() => onPatch({ category_source: "user" })}>
                        Confirm
                      </button>
                    </p>
                  )}
                </Field>
                <Field label="Event or tag">
                  <TagProjectPicker
                    projectId={row.project_id}
                    tag={row.tag}
                    projects={projects}
                    tags={tags}
                    onChange={(v) => onPatch(v)}
                    className="px-2.5 py-1.5 text-sm"
                  />
                </Field>
                <Field label="Explanation">
                  <Textarea
                    rows={3}
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder="What was this payment for? Needed when there is no invoice or receipt."
                  />
                  <div className="flex justify-end">
                    <Button type="button" size="sm" variant="outline" disabled={!dirty || saving} onClick={saveExplanation}>
                      {saving ? "Saving..." : "Save explanation"}
                    </Button>
                  </div>
                </Field>
              </section>

              <ExpenseDocuments transaction={row} onCountChange={onDocCount} />

              <section className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">From the bank statement</h3>
                <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1.5">
                  <dt className="text-neutral-500">Account</dt>
                  <dd>
                    {row.account_label} <span className="text-neutral-400">({row.account_no})</span>
                  </dd>
                  <dt className="text-neutral-500">Paid</dt>
                  <dd>
                    {row.txn_at
                      ? new Date(row.txn_at).toLocaleString("en-MY", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: "Asia/Kuala_Lumpur",
                        })
                      : formatDate(row.txn_date)}
                  </dd>
                  {row.posted_on !== row.txn_date && (
                    <>
                      <dt className="text-neutral-500">Posted</dt>
                      <dd>{formatDate(row.posted_on)}</dd>
                    </>
                  )}
                  {row.txn_type && (
                    <>
                      <dt className="text-neutral-500">Type</dt>
                      <dd>{row.txn_type}</dd>
                    </>
                  )}
                  {row.counterparty && (
                    <>
                      <dt className="text-neutral-500">Paid to</dt>
                      <dd>{row.counterparty}</dd>
                    </>
                  )}
                  {row.reference && (
                    <>
                      <dt className="text-neutral-500">Reference</dt>
                      <dd className="break-words">{row.reference}</dd>
                    </>
                  )}
                  <dt className="text-neutral-500">Balance after</dt>
                  <dd>RM {formatRM(Number(row.balance))}</dd>
                </dl>
                <pre className="whitespace-pre-wrap break-words rounded border bg-neutral-50 p-2 font-mono text-xs text-neutral-700">
                  {row.desc_lines?.length ? row.desc_lines.join("\n") : row.description}
                </pre>
                <Button type="button" size="sm" variant="outline" disabled={!statementPath} onClick={viewStatement}>
                  <FileText /> View statement PDF
                </Button>
              </section>
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
