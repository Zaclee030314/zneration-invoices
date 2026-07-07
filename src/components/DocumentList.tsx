"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { CategoryBadge } from "@/components/CategoryBadge";
import { supabase } from "@/lib/supabase/client";
import { downloadFromApi } from "@/lib/download";
import { duplicateDocument } from "@/lib/documents";
import { invoiceTotals, type DocType, type InvoiceCategory, type InvoiceWithItems } from "@/lib/types";
import { docBasePath, formatRM } from "@/lib/company";

type SortField = "invoice_date" | "invoice_no" | "bill_to_name" | "total";
type SortDir = "asc" | "desc";

export function DocumentList({
  docType,
  title,
  basePath,
  newHref,
  newLabel,
}: {
  docType: DocType;
  title: string;
  basePath: string;
  newHref: string;
  newLabel: string;
}) {
  const [rowsRaw, setRowsRaw] = useState<InvoiceWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<InvoiceCategory | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("invoice_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dupId, setDupId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    load();
  }, [docType]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("doc_type", docType)
      .order("invoice_date", { ascending: false });
    setRowsRaw((data as InvoiceWithItems[]) ?? []);
    setLoading(false);
  }

  const rows = useMemo(() => {
    let list = rowsRaw.map((inv) => ({ inv, ...invoiceTotals(inv, inv.invoice_items) }));
    if (category !== "ALL") list = list.filter((r) => r.inv.category === category);
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
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rowsRaw, category, from, to, search, sortField, sortDir]);

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
    await supabase.from("invoices").delete().eq("id", id);
    load();
  }

  async function duplicate(inv: InvoiceWithItems) {
    if (dupId) return;
    setDupId(inv.id);
    const today = new Date().toISOString().slice(0, 10);
    const res = await duplicateDocument(inv, { docType: inv.doc_type, date: today });
    if ("error" in res) {
      setDupId(null);
      alert(res.error);
      return;
    }
    router.push(`${docBasePath(inv.doc_type)}/${res.id}/edit`);
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

  return (
    <AuthGuard>
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
          <input
            className="border rounded px-3 py-1.5 text-sm"
            placeholder="Search # or client"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input type="date" className="border rounded px-3 py-1.5 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-sm text-neutral-400">to</span>
          <input type="date" className="border rounded px-3 py-1.5 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          <div className="ml-auto flex gap-2">
            <button onClick={exportZip} disabled={!selected.size} className="text-sm border rounded px-3 py-1.5 disabled:opacity-40">
              Export ZIP ({selected.size})
            </button>
            <button onClick={exportCsv} className="text-sm border rounded px-3 py-1.5">
              Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing here yet.</p>
        ) : (
          <table className="w-full text-sm bg-white border rounded overflow-hidden">
            <thead className="bg-neutral-50 border-b">
              <tr>
                <th className="p-2 w-8">
                  <input type="checkbox" checked={selected.size === rows.length} onChange={toggleSelectAll} />
                </th>
                <Th field="invoice_no" label="No." sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-2 text-left">Bucket</th>
                <Th field="bill_to_name" label="Client" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <Th field="invoice_date" label="Date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <Th field="total" label="Total (RM)" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ inv, total }) => (
                <tr key={inv.id} className="border-b last:border-0 hover:bg-neutral-50">
                  <td className="p-2">
                    <input type="checkbox" checked={selected.has(inv.id)} onChange={() => toggleSelect(inv.id)} />
                  </td>
                  <td className="p-2">
                    <Link href={`${basePath}/${inv.id}`} className="hover:underline font-medium">{inv.invoice_no}</Link>
                  </td>
                  <td className="p-2"><CategoryBadge category={inv.category} /></td>
                  <td className="p-2">{inv.bill_to_name}</td>
                  <td className="p-2">{inv.invoice_date}</td>
                  <td className="p-2 text-right">{formatRM(total)}</td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => duplicate(inv)}
                      disabled={dupId === inv.id}
                      className="text-xs text-neutral-500 hover:underline mr-3 disabled:opacity-50"
                    >
                      {dupId === inv.id ? "..." : "Duplicate"}
                    </button>
                    <Link href={`${basePath}/${inv.id}/edit`} className="text-xs text-neutral-500 hover:underline mr-3">Edit</Link>
                    <button
                      onClick={() => downloadFromApi(`/api/invoices/${inv.id}/pdf`, `${inv.invoice_no}.pdf`)}
                      className="text-xs text-neutral-500 hover:underline mr-3"
                    >
                      PDF
                    </button>
                    <button onClick={() => deleteDoc(inv.id)} className="text-xs text-red-500 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AuthGuard>
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
    <th className={`p-2 cursor-pointer select-none text-${align}`} onClick={() => onSort(field)}>
      {label} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}
