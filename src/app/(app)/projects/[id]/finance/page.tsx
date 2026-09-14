"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useProject } from "@/lib/project-context";
import { InvoiceStatusBadge } from "@/components/finance/InvoiceStatusBadge";
import { ScheduleEditor } from "@/components/finance/ScheduleEditor";
import { PaymentsList } from "@/components/finance/PaymentsList";
import {
  fetchPaymentsForInvoices,
  fetchProjectBalances,
  fetchSchedule,
  setAcceptedQuotation,
  updateContractValue,
  type PaymentWithInvoice,
} from "@/lib/queries/finance";
import { DOC_TITLE, docBasePath, formatRM } from "@/lib/company";
import { formatDate } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { InvoiceBalance, ScheduleRow } from "@/lib/types";

export default function ProjectFinancePage() {
  const { project, milestones, loading: projectLoading, notFound, refresh } = useProject();
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [docs, setDocs] = useState<InvoiceBalance[]>([]);
  const [payments, setPayments] = useState<PaymentWithInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingValue, setEditingValue] = useState<string | null>(null);

  const projectId = project?.id ?? null;

  const load = useCallback(async () => {
    if (!projectId) return;
    const [sch, bal] = await Promise.all([fetchSchedule(projectId), fetchProjectBalances(projectId)]);
    if (sch.error) toast.error(sch.error);
    if (bal.error) toast.error(bal.error);
    const balances = bal.data ?? [];
    setSchedule(sch.data ?? []);
    setDocs(balances);
    const invoiceIds = balances.filter((b) => b.doc_type === "invoice").map((b) => b.id);
    const pays = await fetchPaymentsForInvoices(invoiceIds);
    if (pays.error) toast.error(pays.error);
    setPayments(pays.data ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshAll() {
    await Promise.all([load(), refresh()]);
  }

  async function chooseQuotation(id: string) {
    if (!projectId || busy) return;
    setBusy(true);
    const res = await setAcceptedQuotation(projectId, id || null);
    setBusy(false);
    if (res.error) return toast.error(res.error);
    toast.success(id ? `Contract value set to RM ${formatRM(res.data?.contract_value ?? 0)}.` : "Accepted quotation cleared.");
    refreshAll();
  }

  async function saveContractValue() {
    if (!projectId || editingValue === null) return;
    const n = editingValue.trim() === "" ? null : parseFloat(editingValue);
    if (n !== null && !(n >= 0)) return toast.error("Enter a valid amount.");
    setBusy(true);
    const res = await updateContractValue(projectId, n);
    setBusy(false);
    if (res.error) return toast.error(res.error);
    setEditingValue(null);
    refreshAll();
  }

  if (projectLoading) return <p className="text-sm text-neutral-500">Loading...</p>;
  if (notFound || !project) return <p className="text-sm text-neutral-500">Project not found.</p>;

  const quotations = docs.filter((d) => d.doc_type === "quotation");
  const accepted = quotations.find((q) => q.id === project.quotation_id) ?? null;
  const invoices = docs.filter((d) => d.doc_type === "invoice" && d.status !== "void");
  const invoiced = invoices.reduce((s, d) => s + Number(d.total), 0);
  const paid = invoices.reduce((s, d) => s + Number(d.paid_total), 0);

  return (
    <div className="space-y-6">
      {/* Contract */}
      <section className="bg-white border rounded p-4">
        <h2 className="text-sm font-medium mb-3">Contract</h2>
        <div className="grid sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Contract value</p>
            {editingValue === null ? (
              <p className="text-lg font-semibold">
                {project.contract_value != null ? `RM ${formatRM(Number(project.contract_value))}` : <span className="text-neutral-400">Not set</span>}
                <button type="button" onClick={() => setEditingValue(project.contract_value != null ? String(Number(project.contract_value)) : "")} className="ml-2 text-xs font-normal text-neutral-500 hover:underline">
                  edit
                </button>
              </p>
            ) : (
              <div className="flex gap-1 mt-1">
                <input type="number" step="0.01" min="0" className="border rounded px-2 py-1 text-sm w-36" value={editingValue} autoFocus onChange={(e) => setEditingValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveContractValue()} />
                <button type="button" onClick={saveContractValue} disabled={busy} className="text-xs bg-neutral-900 text-white rounded px-2 py-1 disabled:opacity-50">Save</button>
                <button type="button" onClick={() => setEditingValue(null)} className="text-xs text-neutral-500 hover:underline">Cancel</button>
              </div>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Invoiced</p>
            <p className="text-lg font-semibold">RM {formatRM(invoiced)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Paid</p>
            <p className="text-lg font-semibold">RM {formatRM(paid)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Outstanding</p>
            <p className={cn("text-lg font-semibold", invoiced - paid > 0 && "text-red-700")}>RM {formatRM(invoiced - paid)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-neutral-500">Accepted quotation:</span>
          {accepted ? (
            <Link href={`/quotations/${accepted.id}`} className="font-medium hover:underline">
              {accepted.invoice_no} <span className="font-normal text-neutral-500">· RM {formatRM(Number(accepted.total))}</span>
            </Link>
          ) : (
            <span className="text-neutral-400">None</span>
          )}
          <select
            className="border rounded px-2 py-1 text-sm"
            value={project.quotation_id ?? ""}
            disabled={busy || loading}
            onChange={(e) => chooseQuotation(e.target.value)}
          >
            <option value="">{quotations.length ? "Set accepted quotation..." : "No quotations for this project"}</option>
            {quotations.map((q) => (
              <option key={q.id} value={q.id}>
                {q.invoice_no} · {formatDate(q.invoice_date)} · RM {formatRM(Number(q.total))}
              </option>
            ))}
          </select>
          <Link href={`/quotations/new?project=${project.id}`} className="text-xs text-neutral-500 hover:underline">+ New quotation</Link>
        </div>
      </section>

      {/* Payment schedule */}
      <section className="bg-white border rounded p-4">
        <h2 className="text-sm font-medium mb-3">Payment schedule</h2>
        <ScheduleEditor
          projectId={project.id}
          contractValue={project.contract_value != null ? Number(project.contract_value) : null}
          milestones={milestones}
          rows={schedule}
          loading={loading}
          onChanged={load}
        />
      </section>

      {/* Documents */}
      <section className="bg-white border rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Documents</h2>
          <Link href={`/invoices/new?project=${project.id}`} className="text-xs border rounded px-2 py-1 hover:bg-neutral-50">+ New invoice</Link>
        </div>
        {loading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-neutral-500">No quotations, invoices or receipts linked to this project yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b text-left">
                <tr>
                  <th className="p-2 font-medium">No.</th>
                  <th className="p-2 font-medium">Type</th>
                  <th className="p-2 font-medium">Date</th>
                  <th className="p-2 font-medium">Due</th>
                  <th className="p-2 font-medium text-right">Total (RM)</th>
                  <th className="p-2 font-medium text-right">Balance (RM)</th>
                  <th className="p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className={cn("border-b last:border-0", d.status === "void" && "text-neutral-400 line-through")}>
                    <td className="p-2">
                      <Link href={`${docBasePath(d.doc_type)}/${d.id}`} className="font-medium hover:underline">{d.invoice_no}</Link>
                    </td>
                    <td className="p-2">{DOC_TITLE[d.doc_type]}</td>
                    <td className="p-2 whitespace-nowrap">{formatDate(d.invoice_date)}</td>
                    <td className="p-2 whitespace-nowrap">{d.doc_type === "invoice" ? formatDate(d.due_date) || "—" : "—"}</td>
                    <td className="p-2 text-right">{formatRM(Number(d.total))}</td>
                    <td className="p-2 text-right">{d.doc_type === "invoice" && d.status !== "void" ? formatRM(Number(d.balance)) : "—"}</td>
                    <td className="p-2"><InvoiceStatusBadge status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Payments */}
      <section className="bg-white border rounded p-4">
        <h2 className="text-sm font-medium mb-3">Payments received</h2>
        {loading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : (
          <PaymentsList payments={payments} showInvoice onChanged={load} emptyText="No payments received on this project yet." />
        )}
      </section>
    </div>
  );
}
