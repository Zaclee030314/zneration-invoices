"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CategoryBadge } from "@/components/CategoryBadge";
import { InvoiceStatusBadge } from "@/components/finance/InvoiceStatusBadge";
import { PaymentDialog, type PaymentDialogInvoice } from "@/components/finance/PaymentDialog";
import { dateInMonth, nextMonthValue } from "@/components/finance/list-helpers";
import { supabase } from "@/lib/supabase/client";
import { downloadFromApi } from "@/lib/download";
import { duplicateDocument } from "@/lib/documents";
import { fetchBalances } from "@/lib/queries/finance";
import { isClosedInvoiceStatus } from "@/lib/finance";
import { invoiceTotals, type DocType, type InvoiceBalance, type InvoiceCategory, type InvoiceStatus, type InvoiceWithItems } from "@/lib/types";
import { INVOICE_STATUSES, formatDate } from "@/lib/labels";
import { docBasePath, formatRM } from "@/lib/company";
import { cn } from "@/lib/utils";

type SortField = "invoice_date" | "invoice_no" | "bill_to_name" | "total" | "due_date" | "balance";
type SortDir = "asc" | "desc";
type StatusFilter = InvoiceStatus | "ALL";

export function DocumentList({
  docType,
  title,
  basePath,
  newHref,
  newLabel,
  clientId,
  projectId,
}: {
  docType: DocType;
  title: string;
  basePath: string;
  newHref: string;
  newLabel: string;
  // Optional scoping when embedded in a client or project page.
  clientId?: string;
  projectId?: string;
}) {
  const isInvoice = docType === "invoice";
  const [rowsRaw, setRowsRaw] = useState<InvoiceWithItems[]>([]);
  const [balances, setBalances] = useState<Record<string, InvoiceBalance>>({});
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<InvoiceCategory | "ALL">("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("invoice_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dupId, setDupId] = useState<string | null>(null);
  const [bulkMonth, setBulkMonth] = useState(() => nextMonthValue());
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [payFor, setPayFor] = useState<PaymentDialogInvoice | null>(null);
  const router = useRouter();

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType, clientId, projectId]);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("doc_type", docType)
      .order("invoice_date", { ascending: false });
    if (clientId) q = q.eq("client_id", clientId);
    if (projectId) q = q.eq("project_id", projectId);
    const [{ data, error }, bal] = await Promise.all([
      q,
      isInvoice ? fetchBalances({ docType, clientId, projectId }) : Promise.resolve({ data: [] as InvoiceBalance[], error: null }),
    ]);
    if (error) toast.error(error.message);
    if (bal.error) toast.error(bal.error);
    setRowsRaw((data as InvoiceWithItems[]) ?? []);
    setBalances(Object.fromEntries((bal.data ?? []).map((b) => [b.id, b])));
    setLoading(false);
  }

  const rows = useMemo(() => {
    let list = rowsRaw.map((inv) => {
      const b = balances[inv.id];
      const totals = invoiceTotals(inv, inv.invoice_items);
      return {
        inv,
        ...totals,
        paid: Number(b?.paid_total ?? 0),
        balance: b ? Number(b.balance) : totals.total,
        status: b?.status ?? null,
      };
    });
    if (category !== "ALL") list = list.filter((r) => r.inv.category === category);
    if (isInvoice && status !== "ALL") list = list.filter((r) => r.status === status);
    if (from) list = list.filter((r) => r.inv.invoice_date >= from);
    if (to) list = list.filter((r) => r.inv.invoice_date <= to);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) => r.inv.invoice_no.toLowerCase().includes(q) || r.inv.bill_to_name.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "invoice_date") cmp = a.inv.invoice_date.localeCompare(b.inv.invoice_date);
      else if (sortField === "invoice_no") cmp = a.inv.invoice_no.localeCompare(b.inv.invoice_no);
      else if (sortField === "bill_to_name") cmp = a.inv.bill_to_name.localeCompare(b.inv.bill_to_name);
      else if (sortField === "total") cmp = a.total - b.total;
      else if (sortField === "due_date") cmp = (a.inv.due_date ?? "").localeCompare(b.inv.due_date ?? "");
      else if (sortField === "balance") cmp = a.balance - b.balance;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rowsRaw, balances, category, status, from, to, search, sortField, sortDir, isInvoice]);

  const sums = useMemo(() => {
    const live = rows.filter((r) => !isClosedInvoiceStatus(r.status));
    return {
      total: live.reduce((s, r) => s + r.total, 0),
      paid: live.reduce((s, r) => s + r.paid, 0),
      balance: live.reduce((s, r) => s + r.balance, 0),
    };
  }, [rows]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.inv.id))));
  }

  async function deleteDoc(id: string) {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  async function duplicate(inv: InvoiceWithItems) {
    if (dupId) return;
    setDupId(inv.id);
    const today = new Date().toISOString().slice(0, 10);
    const res = await duplicateDocument(inv, { docType: inv.doc_type, date: today });
    if ("error" in res) {
      setDupId(null);
      toast.error(res.error);
      return;
    }
    router.push(`${docBasePath(inv.doc_type)}/${res.id}/edit`);
  }

  // Duplicates every selected document into the chosen month, keeping each
  // document's day-of-month (clamped for shorter months, e.g. 31st -> Feb 28).
  // Runs sequentially so the per-series monthly counters assign unique numbers.
  async function bulkDuplicate() {
    if (!selected.size || bulkProgress || !bulkMonth) return;
    const docs = rows.filter((r) => selected.has(r.inv.id)).map((r) => r.inv);
    if (!confirm(`Duplicate ${docs.length} document(s) into ${bulkMonth}?`)) return;
    setBulkProgress({ done: 0, total: docs.length });
    const errors: string[] = [];
    for (let i = 0; i < docs.length; i++) {
      const inv = docs[i];
      const res = await duplicateDocument(inv, { docType: inv.doc_type, date: dateInMonth(inv.invoice_date, bulkMonth) });
      if ("error" in res) errors.push(`${inv.invoice_no}: ${res.error}`);
      setBulkProgress({ done: i + 1, total: docs.length });
    }
    setBulkProgress(null);
    setSelected(new Set());
    if (errors.length) toast.error(`Some duplicates failed:\n${errors.join("\n")}`);
    else toast.success(`Duplicated ${docs.length} document(s) into ${bulkMonth}.`);
    load();
  }

  async function exportZip() {
    if (!selected.size) return;
    await downloadFromApi("/api/invoices/export-zip", `${docType}s.zip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
  }

  async function exportCsv() {
    const params = new URLSearchParams();
    params.set("docType", docType);
    if (category !== "ALL") params.set("category", category);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (search) params.set("search", search);
    await downloadFromApi(`/api/invoices/export-csv?${params.toString()}`, `${docType}s.csv`);
  }

  const colCount = isInvoice ? 11 : 7;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Link href={newHref} className="bg-neutral-900 text-white px-4 py-2 rounded text-sm">
          {newLabel}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 items-center bg-white border rounded p-3">
        <div className="flex gap-1">
          {(["ALL", "EVIV", "ZMIV"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded text-sm ${category === c ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}
            >
              {c}
            </button>
          ))}
        </div>
        {isInvoice && (
          <select className="border rounded px-2 py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="ALL">All statuses</option>
            {INVOICE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        )}
        <input className="border rounded px-3 py-1.5 text-sm" placeholder="Search # or client" value={search} onChange={(e) => setSearch(e.target.value)} />
        <input type="date" className="border rounded px-3 py-1.5 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-sm text-neutral-400">to</span>
        <input type="date" className="border rounded px-3 py-1.5 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="ml-auto flex gap-2 items-center">
          <input type="month" className="border rounded px-2 py-1.5 text-sm" title="Target month for bulk duplicate" value={bulkMonth} onChange={(e) => setBulkMonth(e.target.value)} />
          <button onClick={bulkDuplicate} disabled={!selected.size || !!bulkProgress || !bulkMonth} className="text-sm border rounded px-3 py-1.5 disabled:opacity-40">
            {bulkProgress ? `Duplicating ${bulkProgress.done}/${bulkProgress.total}...` : `Duplicate (${selected.size})`}
          </button>
          <button onClick={exportZip} disabled={!selected.size} className="text-sm border rounded px-3 py-1.5 disabled:opacity-40">
            Export ZIP ({selected.size})
          </button>
          <button onClick={exportCsv} className="text-sm border rounded px-3 py-1.5">Export CSV</button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing here yet.</p>
      ) : (
        <div className="overflow-x-auto bg-white border rounded">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b">
              <tr>
                <th className="p-2 w-8">
                  <input type="checkbox" checked={selected.size === rows.length} onChange={toggleSelectAll} />
                </th>
                <Th field="invoice_no" label="No." sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-2 text-left">Bucket</th>
                {isInvoice && <th className="p-2 text-left">Status</th>}
                <Th field="bill_to_name" label="Client" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <Th field="invoice_date" label="Date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                {isInvoice && <Th field="due_date" label="Due" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />}
                <Th field="total" label="Total (RM)" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                {isInvoice && <th className="p-2 text-right">Paid</th>}
                {isInvoice && <Th field="balance" label="Balance" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />}
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ inv, total, paid, balance, status: st }) => {
                const voided = st === "void";
                const closed = isClosedInvoiceStatus(st);
                const strike = voided ? "line-through text-neutral-400" : "";
                return (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-neutral-50">
                    <td className="p-2">
                      <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggleSelect(inv.id)} />
                    </td>
                    <td className={cn("p-2", strike)}>
                      <Link href={`${basePath}/${inv.id}`} className="hover:underline font-medium">{inv.invoice_no}</Link>
                    </td>
                    <td className="p-2"><CategoryBadge category={inv.category} /></td>
                    {isInvoice && <td className="p-2"><InvoiceStatusBadge status={st} /></td>}
                    <td className={cn("p-2", strike)}>{inv.bill_to_name}</td>
                    <td className={cn("p-2 whitespace-nowrap", strike)}>{inv.invoice_date}</td>
                    {isInvoice && (
                      <td className={cn("p-2 whitespace-nowrap", st === "overdue" && "text-red-700", strike)}>{formatDate(inv.due_date) || "—"}</td>
                    )}
                    <td className={cn("p-2 text-right", strike)}>{formatRM(total)}</td>
                    {isInvoice && <td className="p-2 text-right">{paid ? formatRM(paid) : "—"}</td>}
                    {isInvoice && <td className={cn("p-2 text-right", balance > 0 && !closed && "font-medium")}>{closed ? "—" : formatRM(balance)}</td>}
                    <td className="p-2 text-right whitespace-nowrap">
                      {isInvoice && !closed && st !== "paid" && (
                        <button
                          onClick={() => setPayFor({ id: inv.id, invoice_no: inv.invoice_no, total, balance })}
                          className="text-xs text-emerald-700 hover:underline mr-3"
                        >
                          Record payment
                        </button>
                      )}
                      <button onClick={() => duplicate(inv)} disabled={dupId === inv.id} className="text-xs text-neutral-500 hover:underline mr-3 disabled:opacity-50">
                        {dupId === inv.id ? "..." : "Duplicate"}
                      </button>
                      <Link href={`${basePath}/${inv.id}/edit`} className="text-xs text-neutral-500 hover:underline mr-3">Edit</Link>
                      <button onClick={() => downloadFromApi(`/api/invoices/${inv.id}/pdf`, `${inv.invoice_no}.pdf`)} className="text-xs text-neutral-500 hover:underline mr-3">
                        PDF
                      </button>
                      <button onClick={() => deleteDoc(inv.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {isInvoice && (
              <tfoot className="bg-neutral-50 border-t font-medium">
                <tr>
                  <td className="p-2" colSpan={colCount - 4}>
                    {rows.length} invoice{rows.length === 1 ? "" : "s"} <span className="font-normal text-neutral-400">(void and refunded excluded)</span>
                  </td>
                  <td className="p-2 text-right">{formatRM(sums.total)}</td>
                  <td className="p-2 text-right">{formatRM(sums.paid)}</td>
                  <td className="p-2 text-right">{formatRM(sums.balance)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <PaymentDialog invoice={payFor} open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} onSaved={load} />
    </div>
  );
}

function Th({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  align = "left",
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  align?: "left" | "right";
}) {
  const active = sortField === field;
  return (
    <th className={cn("p-2 cursor-pointer select-none whitespace-nowrap", align === "right" ? "text-right" : "text-left")} onClick={() => onSort(field)}>
      {label} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}
