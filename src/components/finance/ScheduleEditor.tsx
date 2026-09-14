"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import { SCHEDULE_PRESETS, expectedAmount, scheduleTotals } from "@/lib/finance";
import { createScheduleRow, deleteScheduleRow, replaceSchedule, updateScheduleRow, type ScheduleInput } from "@/lib/queries/finance";
import { formatDate } from "@/lib/labels";
import { formatRM } from "@/lib/company";
import { cn } from "@/lib/utils";
import type { Milestone, ScheduleRow } from "@/lib/types";

type Draft = {
  id: string | null; // null = new row
  label: string;
  mode: "percent" | "amount";
  value: string;
  due_date: string;
  milestone_id: string;
};

function draftFrom(row: ScheduleRow): Draft {
  const mode = row.amount != null ? "amount" : "percent";
  return {
    id: row.id,
    label: row.label,
    mode,
    value: String(Number(mode === "amount" ? row.amount : row.percent) ?? ""),
    due_date: row.due_date ?? "",
    milestone_id: row.milestone_id ?? "",
  };
}

function toInput(d: Draft): ScheduleInput | string {
  const n = parseFloat(d.value);
  if (!d.label.trim()) return "Label is required.";
  if (!(n > 0)) return d.mode === "percent" ? "Percent must be greater than zero." : "Amount must be greater than zero.";
  return {
    label: d.label.trim(),
    percent: d.mode === "percent" ? n : null,
    amount: d.mode === "amount" ? n : null,
    due_date: d.due_date || null,
    milestone_id: d.milestone_id || null,
  };
}

// Payment schedule table for one project: inline add/edit/delete, presets,
// and a "Create invoice" shortcut per unlinked row.
export function ScheduleEditor({
  projectId,
  contractValue,
  milestones,
  rows,
  loading,
  onChanged,
}: {
  projectId: string;
  contractValue: number | null;
  milestones: Milestone[];
  rows: ScheduleRow[];
  loading: boolean;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const totals = scheduleTotals(rows);
  const nextSeq = rows.reduce((m, r) => Math.max(m, r.seq), 0) + 1;

  function startAdd() {
    setDraft({ id: null, label: "", mode: "percent", value: "", due_date: "", milestone_id: "" });
  }

  async function saveDraft() {
    if (!draft || busy) return;
    const input = toInput(draft);
    if (typeof input === "string") return toast.error(input);
    setBusy(true);
    const res = draft.id ? await updateScheduleRow(draft.id, input) : await createScheduleRow(projectId, nextSeq, input);
    setBusy(false);
    if (res.error) return toast.error(res.error);
    setDraft(null);
    onChanged();
  }

  async function remove(row: ScheduleRow) {
    if (busy) return;
    const warn = row.invoice_id ? ` It is linked to ${row.invoice_no}; the invoice itself is kept.` : "";
    if (!confirm(`Delete "${row.label}"?${warn}`)) return;
    setBusy(true);
    const res = await deleteScheduleRow(row.id);
    setBusy(false);
    if (res.error) return toast.error(res.error);
    onChanged();
  }

  async function applyPreset(key: string) {
    if (busy) return;
    const preset = SCHEDULE_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    if (rows.length && !confirm(`Replace the current ${rows.length} schedule row(s) with ${preset.label}? Linked invoices are kept but unlinked.`)) return;
    setBusy(true);
    const res = await replaceSchedule(
      projectId,
      preset.rows.map((r) => ({ label: r.label, percent: r.percent, amount: null, due_date: null, milestone_id: null }))
    );
    setBusy(false);
    if (res.error) return toast.error(res.error);
    setDraft(null);
    toast.success(`Schedule set to ${preset.label}.`);
    onChanged();
  }

  const noContract = contractValue == null && rows.some((r) => r.percent != null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-500">Presets:</span>
        {SCHEDULE_PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => applyPreset(p.key)} disabled={busy} className="text-xs border rounded px-2 py-1 hover:bg-neutral-50 disabled:opacity-50">
            {p.label}
          </button>
        ))}
        <button type="button" onClick={startAdd} disabled={busy || !!draft} className="ml-auto text-sm border rounded px-3 py-1.5 disabled:opacity-40">
          + Add row
        </button>
      </div>

      {noContract && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Set a contract value (or accept a quotation) so percentage rows get an expected amount.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading schedule...</p>
      ) : rows.length === 0 && !draft ? (
        <p className="text-sm text-neutral-500">No payment schedule yet. Pick a preset or add a row.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b text-left">
              <tr>
                <th className="p-2 w-8 font-medium">#</th>
                <th className="p-2 font-medium">Label</th>
                <th className="p-2 font-medium">% / Amount</th>
                <th className="p-2 font-medium text-right">Expected (RM)</th>
                <th className="p-2 font-medium">Due</th>
                <th className="p-2 font-medium">Milestone</th>
                <th className="p-2 font-medium">Invoice</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) =>
                draft?.id === row.id ? (
                  <DraftRow key={row.id} seq={row.seq} draft={draft} setDraft={setDraft} milestones={milestones} contractValue={contractValue} busy={busy} onSave={saveDraft} onCancel={() => setDraft(null)} />
                ) : (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="p-2 text-neutral-400">{row.seq}</td>
                    <td className="p-2 font-medium">{row.label}</td>
                    <td className="p-2">{row.amount != null ? `RM ${formatRM(Number(row.amount))}` : `${Number(row.percent)}%`}</td>
                    <td className="p-2 text-right">{row.expected_amount != null ? formatRM(Number(row.expected_amount)) : "—"}</td>
                    <td className="p-2 whitespace-nowrap">{formatDate(row.due_date) || "—"}</td>
                    <td className="p-2 text-neutral-600">{milestones.find((m) => m.id === row.milestone_id)?.title ?? "—"}</td>
                    <td className="p-2 whitespace-nowrap">
                      {row.invoice_id ? (
                        <span className="inline-flex items-center gap-2">
                          <Link href={`/invoices/${row.invoice_id}`} className="font-medium hover:underline">{row.invoice_no}</Link>
                          <InvoiceStatusBadge status={row.invoice_status} />
                          {row.paid_total != null && Number(row.paid_total) > 0 && row.invoice_status !== "paid" && (
                            <span className="text-xs text-neutral-500">RM {formatRM(Number(row.paid_total))} paid</span>
                          )}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => router.push(`/invoices/new?project=${projectId}&schedule=${row.id}`)}
                          className="text-xs border rounded px-2 py-1 hover:bg-neutral-50"
                        >
                          Create invoice
                        </button>
                      )}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => setDraft(draftFrom(row))} disabled={busy || !!draft} className="text-xs text-neutral-500 hover:underline mr-3 disabled:opacity-40">Edit</button>
                      <button type="button" onClick={() => remove(row)} disabled={busy} className="text-xs text-red-500 hover:underline disabled:opacity-40">Delete</button>
                    </td>
                  </tr>
                )
              )}
              {draft && draft.id === null && (
                <DraftRow seq={nextSeq} draft={draft} setDraft={setDraft} milestones={milestones} contractValue={contractValue} busy={busy} onSave={saveDraft} onCancel={() => setDraft(null)} />
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t bg-neutral-50 font-medium">
                <tr>
                  <td className="p-2" colSpan={2}>Total</td>
                  <td className={cn("p-2", totals.percent > 100.001 && "text-red-700")}>{totals.percent ? `${Number(totals.percent.toFixed(2))}%` : "—"}</td>
                  <td className="p-2 text-right">{formatRM(totals.expected)}</td>
                  <td className="p-2" colSpan={4}>
                    <span className="text-neutral-500 font-normal">Invoiced</span> RM {formatRM(totals.invoiced)}
                    <span className="mx-2 text-neutral-300">·</span>
                    <span className="text-neutral-500 font-normal">Paid</span> RM {formatRM(totals.paid)}
                    <span className="mx-2 text-neutral-300">·</span>
                    <span className="text-neutral-500 font-normal">Outstanding</span>{" "}
                    <span className={cn(totals.outstanding > 0 && "text-red-700")}>RM {formatRM(totals.outstanding)}</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

function DraftRow({
  seq,
  draft,
  setDraft,
  milestones,
  contractValue,
  busy,
  onSave,
  onCancel,
}: {
  seq: number;
  draft: Draft;
  setDraft: (d: Draft) => void;
  milestones: Milestone[];
  contractValue: number | null;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const n = parseFloat(draft.value);
  const expected = expectedAmount({ percent: draft.mode === "percent" ? n : null, amount: draft.mode === "amount" ? n : null }, contractValue);
  const input = "border rounded px-2 py-1 text-sm w-full";
  return (
    <tr className="border-b last:border-0 bg-neutral-50/60">
      <td className="p-2 text-neutral-400">{seq}</td>
      <td className="p-2">
        <input
          className={input}
          placeholder="Deposit"
          value={draft.label}
          autoFocus
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onSave())}
        />
      </td>
      <td className="p-2">
        <div className="flex gap-1">
          <select className="border rounded px-1 py-1 text-sm" value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value as Draft["mode"] })}>
            <option value="percent">%</option>
            <option value="amount">RM</option>
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            className={cn(input, "w-24")}
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onSave())}
          />
        </div>
      </td>
      <td className="p-2 text-right text-neutral-500">{expected != null && Number.isFinite(expected) ? formatRM(expected) : "—"}</td>
      <td className="p-2">
        <input type="date" className={input} value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} />
      </td>
      <td className="p-2">
        <select className={input} value={draft.milestone_id} onChange={(e) => setDraft({ ...draft, milestone_id: e.target.value })}>
          <option value="">—</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>{m.title}</option>
          ))}
        </select>
      </td>
      <td className="p-2"></td>
      <td className="p-2 text-right whitespace-nowrap">
        <button type="button" onClick={onSave} disabled={busy} className="text-xs bg-neutral-900 text-white rounded px-2 py-1 mr-2 disabled:opacity-50">
          {busy ? "..." : "Save"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="text-xs text-neutral-500 hover:underline">Cancel</button>
      </td>
    </tr>
  );
}
