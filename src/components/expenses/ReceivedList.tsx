"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import type { BankAccount, BankTag, BankTransactionRow, ReceivedStatus, TxnCategory } from "@/lib/types";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, RECEIVED_STATUSES, formatDate } from "@/lib/labels";
import { formatRM } from "@/lib/company";
import { accountLabel, expenseStatus, payeeLabel } from "@/lib/expenses";
import type { MatchInvoice, MatchPayment } from "@/lib/receipts";
import { listProjects } from "@/lib/queries/projects";
import { fetchAccounts, fetchTags, fetchTransactions, findCounterpartyMatches, updateTransactions, type TransactionPatch } from "@/lib/queries/expenses";
import { fetchLinkedPayments, fetchMatchInvoices, fetchUnlinkedPayments, type LinkedPayment } from "@/lib/queries/receipts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AutoMatchDialog } from "./AutoMatchDialog";
import { CategorySelect } from "./CategorySelect";
import { ExpenseStatusBadge } from "./ExpenseStatusBadge";
import { SortTh as Th, SummaryCard, type SortDir } from "./ListParts";
import { ReceivedSheet } from "./ReceivedSheet";
import type { PickerProject } from "./TagProjectPicker";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type SortField = "txn_date" | "payer" | "amount";
type StatusFilter = "all" | "open" | ReceivedStatus;
type CategoryFilter = "all" | "none" | TxnCategory;
const IN_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => c.directions.includes("in"));

const sumOf = (list: BankTransactionRow[]) => list.reduce((s, r) => s + Number(r.amount), 0);
const unlinkedOf = (r: BankTransactionRow) => Math.max(0, Number(r.amount) - Number(r.linked_total ?? 0));

// Money received on the bank statements, and the invoices each credit paid.
export function ReceivedList() {
  const params = useSearchParams();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(() => Number(params.get("year")) || thisYear);
  const [rows, setRows] = useState<BankTransactionRow[]>([]);
  const [linked, setLinked] = useState<Record<string, LinkedPayment[]>>({});
  const [payments, setPayments] = useState<MatchPayment[]>([]);
  const [invoices, setInvoices] = useState<MatchInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [projects, setProjects] = useState<PickerProject[]>([]);
  const [tags, setTags] = useState<BankTag[]>([]);
  const [month, setMonth] = useState("all");
  const [account, setAccount] = useState("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [hideOwn, setHideOwn] = useState(true);
  const [sortField, setSortField] = useState<SortField>("txn_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(() => params.get("txn"));
  const [bulkNote, setBulkNote] = useState("");
  const [matching, setMatching] = useState(false);

  useEffect(() => {
    Promise.all([fetchAccounts(), fetchTags(), listProjects().catch(() => [])]).then(([a, t, p]) => {
      if (a.error !== null) toast.error(a.error);
      else setAccounts(a.data);
      if (t.error === null) setTags(t.data);
      setProjects(p.map(({ id, code, name, kind }) => ({ id, code, name, kind })));
    });
  }, []);

  const reload = useCallback(async () => {
    const [txns, links, unlinked, invs] = await Promise.all([
      fetchTransactions({ from: `${year}-01-01`, to: `${year}-12-31` }, "in"),
      fetchLinkedPayments(),
      fetchUnlinkedPayments(),
      fetchMatchInvoices(),
    ]);
    const error = txns.error ?? links.error ?? unlinked.error ?? invs.error;
    if (error) toast.error(error);
    setRows(txns.data ?? []);
    setLinked(links.data ?? {});
    setPayments(unlinked.data ?? []);
    setInvoices(invs.data ?? []);
  }, [year]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelected(new Set());
    reload().then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // Every filter except category and status: the summary cards count within this.
  const base = useMemo(() => {
    let list = rows;
    if (month !== "all") list = list.filter((r) => r.txn_date.slice(5, 7) === month);
    if (account !== "all") list = list.filter((r) => r.account_id === account);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.counterparty, r.reference, r.description, r.tag, r.explanation, formatRM(Number(r.amount)), ...(linked[r.id] ?? []).map((p) => p.invoice_no)].some((v) =>
          v?.toLowerCase().includes(q)
        )
      );
    }
    return list;
  }, [rows, month, account, search, linked]);

  const ownTransfers = useMemo(() => base.filter((r) => r.category === "own_transfer"), [base]);
  const scoped = useMemo(() => {
    if (category === "own_transfer") return ownTransfers;
    let list = base.filter((r) => r.category !== "own_transfer");
    if (category === "none") list = list.filter((r) => !r.category);
    else if (category !== "all") list = list.filter((r) => r.category === category);
    return list;
  }, [base, ownTransfers, category]);

  const visible = useMemo(() => {
    let list = category === "all" && !hideOwn ? [...scoped, ...ownTransfers] : scoped;
    if (status === "open") list = list.filter((r) => r.status === "unmatched" || r.status === "partial");
    else if (status !== "all") list = list.filter((r) => r.status === status);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "txn_date") cmp = a.txn_date.localeCompare(b.txn_date) || (a.txn_at ?? "").localeCompare(b.txn_at ?? "") || a.seq - b.seq;
      else if (sortField === "payer") cmp = payeeLabel(a).localeCompare(payeeLabel(b));
      else cmp = Number(a.amount) - Number(b.amount);
      return cmp * dir;
    });
  }, [scoped, ownTransfers, category, hideOwn, status, sortField, sortDir]);

  const matched = scoped.filter((r) => Number(r.linked_total) > 0);
  const open = scoped.filter((r) => r.status === "unmatched" || r.status === "partial");
  const noInvoice = scoped.filter((r) => r.status === "no_invoice");
  const openRow = rows.find((r) => r.id === openId) ?? null;
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  async function patchRows(ids: string[], patch: TransactionPatch): Promise<boolean> {
    if (!ids.length) return true;
    const res = await updateTransactions(ids, patch);
    if (res.error !== null) {
      toast.error(res.error);
      return false;
    }
    const idSet = new Set(ids);
    setRows((prev) =>
      prev.map((r) => {
        if (!idSet.has(r.id)) return r;
        const next = { ...r, ...patch } as BankTransactionRow;
        return { ...next, ...expenseStatus(next) };
      })
    );
    const newTag = patch.tag;
    if (newTag && !tags.some((t) => t.tag === newTag)) {
      setTags((prev) => [{ workspace_id: "", tag: newTag, use_count: ids.length, last_used_at: new Date().toISOString() }, ...prev]);
    }
    return true;
  }

  async function chooseCategory(row: BankTransactionRow, value: TxnCategory | null) {
    const saved = await patchRows([row.id], { category: value, category_source: value ? "user" : null });
    if (!saved || !value || !row.counterparty_key) return;
    const matches = await findCounterpartyMatches(row, value, [row.id]);
    if (matches.error !== null || !matches.data.length) return;
    const ids = matches.data;
    toast(`Also set "${EXPENSE_CATEGORY_LABEL[value]}" on ${ids.length} other credit${ids.length === 1 ? "" : "s"} from ${row.counterparty}?`, {
      duration: 12000,
      action: {
        label: "Apply",
        onClick: () => {
          patchRows(ids, { category: value, category_source: "user" }).then((ok) => {
            if (ok) toast.success(`Updated ${ids.length} credit${ids.length === 1 ? "" : "s"}.`);
          });
        },
      },
    });
  }

  async function bulk(patch: TransactionPatch, message: string) {
    const ids = [...selected];
    if (await patchRows(ids, patch)) toast.success(`${message} on ${ids.length} credit${ids.length === 1 ? "" : "s"}.`);
  }

  async function bulkExplain() {
    const note = bulkNote.trim();
    if (!note) return;
    const replacing = rows.filter((r) => selected.has(r.id) && r.explanation?.trim()).length;
    if (replacing && !confirm(`${replacing} of the selected credits already have an explanation. Replace it?`)) return;
    await bulk({ explanation: note }, "Explanation added");
    setBulkNote("");
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir(field === "payer" ? "asc" : "desc");
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const select = "border rounded px-2 py-1.5 text-sm bg-white";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded border bg-white p-3">
        <select aria-label="Year" className={select} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select aria-label="Month" className={select} value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">All months</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, "0")}>
              {m}
            </option>
          ))}
        </select>
        <select aria-label="Account" className={select} value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="all">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {accountLabel(a)}
            </option>
          ))}
        </select>
        <select aria-label="Category" className={select} value={category} onChange={(e) => setCategory(e.target.value as CategoryFilter)}>
          <option value="all">All categories</option>
          <option value="none">Uncategorised</option>
          {IN_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select aria-label="Status" className={select} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="all">All statuses</option>
          <option value="open">Still to match</option>
          {RECEIVED_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input className="min-w-[12rem] flex-1 rounded border px-3 py-1.5 text-sm" placeholder="Search payer, reference, invoice or amount" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input type="checkbox" checked={hideOwn} onChange={(e) => setHideOwn(e.target.checked)} /> Hide own-account transfers
        </label>
        <Button type="button" variant="outline" size="sm" onClick={() => setMatching(true)}>
          <Wand2 /> Match recorded payments
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Money received" value={sumOf(scoped)} sub={`${scoped.length} credit${scoped.length === 1 ? "" : "s"}`} />
        <SummaryCard
          label="Linked to invoices"
          value={matched.reduce((s, r) => s + Math.min(Number(r.linked_total), Number(r.amount)), 0)}
          sub={`${matched.length} credit${matched.length === 1 ? "" : "s"} linked`}
          tone="emerald"
          active={status === "matched"}
          onClick={() => setStatus((s) => (s === "matched" ? "all" : "matched"))}
        />
        <SummaryCard
          label="Still to match"
          value={open.reduce((s, r) => s + unlinkedOf(r), 0)}
          sub={`${open.length} credit${open.length === 1 ? "" : "s"} without an invoice`}
          tone="amber"
          active={status === "open"}
          onClick={() => setStatus((s) => (s === "open" ? "all" : "open"))}
        />
        <SummaryCard
          label="No invoice needed"
          value={sumOf(noInvoice)}
          sub={`${noInvoice.length} loans, refunds, sales or explained`}
          active={status === "no_invoice"}
          onClick={() => setStatus((s) => (s === "no_invoice" ? "all" : "no_invoice"))}
        />
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded bg-neutral-900 px-3 py-2 text-sm text-white">
          <span className="font-medium">{selected.size} selected</span>
          <select
            aria-label="Set category for selected"
            className="rounded px-2 py-1 text-sm text-neutral-900"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const value = v === "none" ? null : (v as TxnCategory);
              bulk({ category: value, category_source: value ? "user" : null }, value ? `Set "${EXPENSE_CATEGORY_LABEL[value]}"` : "Cleared category");
            }}
          >
            <option value="">Set category...</option>
            <option value="none">Uncategorised</option>
            {IN_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            className="w-64 rounded px-2 py-1 text-sm text-neutral-900"
            placeholder="Explanation for all selected"
            value={bulkNote}
            onChange={(e) => setBulkNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && bulkExplain()}
          />
          <button type="button" className="rounded border border-white/40 px-2 py-1 disabled:opacity-40" disabled={!bulkNote.trim()} onClick={bulkExplain}>
            Add explanation
          </button>
          <button type="button" className="ml-auto text-neutral-300 hover:text-white" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : rows.length === 0 ? (
        <div className="rounded border bg-white p-6 text-sm text-neutral-600">
          No money received in {year} yet.{" "}
          <Link href="/expenses/statements" className="underline">
            Upload bank statements
          </Link>{" "}
          to list the credits.
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-neutral-500">No credits match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-neutral-50">
              <tr>
                <th className="w-8 p-2">
                  <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)))} />
                </th>
                <Th field="txn_date" label="Date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-2 text-left">Account</th>
                <Th field="payer" label="Received from" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <Th field="amount" label="Amount (RM)" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                <th className="p-2 text-left">Category</th>
                <th className="p-2 text-left">Invoices</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const links = linked[r.id] ?? [];
                return (
                  <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer border-b last:border-0 hover:bg-neutral-50">
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label="Select credit" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} />
                    </td>
                    <td className="whitespace-nowrap p-2">{formatDate(r.txn_date)}</td>
                    <td className="whitespace-nowrap p-2">
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{r.account_label}</span>
                    </td>
                    <td className="max-w-[18rem] p-2">
                      <div className="truncate font-medium">{payeeLabel(r)}</div>
                      {r.counterparty && r.reference && <div className="truncate text-xs text-neutral-500">{r.reference}</div>}
                    </td>
                    <td className="whitespace-nowrap p-2 text-right tabular-nums">{formatRM(Number(r.amount))}</td>
                    <td className="min-w-[11rem] p-2" onClick={(e) => e.stopPropagation()}>
                      <CategorySelect value={r.category} direction="in" onChange={(v) => chooseCategory(r, v)} muted={r.category_source !== "user"} />
                    </td>
                    <td className="max-w-[14rem] p-2">
                      {links.length ? (
                        <div className="flex flex-wrap gap-1">
                          {links.map((p) => (
                            <Link
                              key={p.id}
                              href={`/invoices/${p.invoice_id}`}
                              onClick={(e) => e.stopPropagation()}
                              title={`${p.bill_to_name} · RM ${formatRM(p.amount)}`}
                              className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800 hover:underline"
                            >
                              {p.invoice_no}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="p-2">
                      <ExpenseStatusBadge status={r.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t bg-neutral-50 font-medium">
              <tr>
                <td className="p-2" colSpan={4}>
                  {visible.length} credit{visible.length === 1 ? "" : "s"}
                </td>
                <td className="p-2 text-right tabular-nums">{formatRM(sumOf(visible))}</td>
                <td colSpan={3} className={cn("p-2 text-xs font-normal text-neutral-500")}>
                  RM {formatRM(visible.reduce((s, r) => s + unlinkedOf(r), 0))} not linked to invoices
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <ReceivedSheet
        row={openRow}
        linked={openRow ? linked[openRow.id] ?? [] : []}
        payments={payments}
        invoices={invoices}
        projects={projects}
        tags={tags}
        onClose={() => setOpenId(null)}
        onPatch={(patch) => (openRow ? patchRows([openRow.id], patch) : Promise.resolve(false))}
        onCategory={(value) => openRow && chooseCategory(openRow, value)}
        onChanged={reload}
      />
      <AutoMatchDialog open={matching} onOpenChange={setMatching} onLinked={reload} />
    </div>
  );
}
