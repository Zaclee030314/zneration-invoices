"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import type { BankAccount, BankTag, BankTransactionRow, ExpenseStatus, TxnCategory } from "@/lib/types";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, EXPENSE_STATUSES, formatDate } from "@/lib/labels";
import { formatRM } from "@/lib/company";
import { accountLabel, expenseStatus, payeeLabel } from "@/lib/expenses";
import { listProjects } from "@/lib/queries/projects";
import {
  fetchAccounts, fetchTags, fetchTransactions, findCounterpartyMatches, updateTransactions, type TransactionPatch,
} from "@/lib/queries/expenses";
import { cn } from "@/lib/utils";
import { CategorySelect } from "./CategorySelect";
import { ExpenseSheet } from "./ExpenseSheet";
import { ExpenseStatusBadge } from "./ExpenseStatusBadge";
import { TagProjectPicker, type LinkValue, type PickerProject } from "./TagProjectPicker";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type SortField = "txn_date" | "payee" | "amount";
type SortDir = "asc" | "desc";
type CategoryFilter = "all" | "none" | TxnCategory;

const sumOf = (list: BankTransactionRow[]) => list.reduce((s, r) => s + Number(r.amount), 0);

export function ExpensesList() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<BankTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [projects, setProjects] = useState<PickerProject[]>([]);
  const [tags, setTags] = useState<BankTag[]>([]);
  const [month, setMonth] = useState("all");
  const [account, setAccount] = useState("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [status, setStatus] = useState<"all" | ExpenseStatus>("all");
  const [link, setLink] = useState("all");
  const [search, setSearch] = useState("");
  const [hideOwn, setHideOwn] = useState(true);
  const [sortField, setSortField] = useState<SortField>("txn_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkNote, setBulkNote] = useState("");

  useEffect(() => {
    Promise.all([fetchAccounts(), fetchTags(), listProjects().catch(() => [])]).then(([a, t, p]) => {
      if (a.error !== null) toast.error(a.error);
      else setAccounts(a.data);
      if (t.error === null) setTags(t.data);
      setProjects(p.map(({ id, code, name, kind }) => ({ id, code, name, kind })));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelected(new Set());
    fetchTransactions({ from: `${year}-01-01`, to: `${year}-12-31` }).then((res) => {
      if (cancelled) return;
      if (res.error !== null) toast.error(res.error);
      else setRows(res.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  // Every filter except category and status: the summary cards count within this.
  const base = useMemo(() => {
    let list = rows;
    if (month !== "all") list = list.filter((r) => r.txn_date.slice(5, 7) === month);
    if (account !== "all") list = list.filter((r) => r.account_id === account);
    if (link === "none") list = list.filter((r) => !r.project_id && !r.tag);
    else if (link.startsWith("p:")) list = list.filter((r) => r.project_id === link.slice(2));
    else if (link.startsWith("t:")) list = list.filter((r) => r.tag === link.slice(2));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.counterparty, r.reference, r.description, r.tag, r.project_name, r.project_code, r.explanation, formatRM(Number(r.amount))].some((v) =>
          v?.toLowerCase().includes(q)
        )
      );
    }
    return list;
  }, [rows, month, account, link, search]);

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
    if (status !== "all") list = list.filter((r) => r.status === status);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "txn_date") cmp = a.txn_date.localeCompare(b.txn_date) || (a.txn_at ?? "").localeCompare(b.txn_at ?? "") || a.seq - b.seq;
      else if (sortField === "payee") cmp = payeeLabel(a).localeCompare(payeeLabel(b));
      else cmp = Number(a.amount) - Number(b.amount);
      return cmp * dir;
    });
  }, [scoped, ownTransfers, category, hideOwn, status, sortField, sortDir]);

  const byCategory = useMemo(() => {
    const map = new Map<TxnCategory | "none", { key: TxnCategory | "none"; count: number; amount: number }>();
    for (const r of base) {
      if (r.category === "own_transfer") continue;
      const key = r.category ?? "none";
      const entry = map.get(key) ?? { key, count: 0, amount: 0 };
      entry.count++;
      entry.amount += Number(r.amount);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [base]);

  const linkOptions = useMemo(() => {
    const used = new Map<string, string>();
    const usedTags = new Set<string>();
    for (const r of rows) {
      if (r.project_id) used.set(r.project_id, `${r.project_code} · ${r.project_name}`);
      if (r.tag) usedTags.add(r.tag);
    }
    return { projects: [...used.entries()].sort((a, b) => a[1].localeCompare(b[1])), tags: [...usedTags].sort() };
  }, [rows]);

  const done = scoped.filter((r) => r.status === "done");
  const attention = scoped.filter((r) => r.status === "needs_attention");
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
    const project = "project_id" in patch ? projects.find((p) => p.id === patch.project_id) ?? null : undefined;
    setRows((prev) =>
      prev.map((r) => {
        if (!idSet.has(r.id)) return r;
        const next: BankTransactionRow = { ...r, ...patch };
        if (project !== undefined) {
          next.project_code = project?.code ?? null;
          next.project_name = project?.name ?? null;
          next.project_kind = project?.kind ?? null;
        }
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
    toast(`Also set "${EXPENSE_CATEGORY_LABEL[value]}" on ${ids.length} other payment${ids.length === 1 ? "" : "s"} to ${row.counterparty}?`, {
      duration: 12000,
      action: {
        label: "Apply",
        onClick: () => {
          patchRows(ids, { category: value, category_source: "user" }).then((ok) => ok && toast.success(`Updated ${ids.length} payment${ids.length === 1 ? "" : "s"}.`));
        },
      },
    });
  }

  function setDocCount(id: string, count: number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id || r.doc_count === count) return r;
        const next = { ...r, doc_count: count };
        return { ...next, ...expenseStatus(next) };
      })
    );
  }

  async function bulk(patch: TransactionPatch, message: string) {
    const ids = [...selected];
    if (await patchRows(ids, patch)) toast.success(`${message} on ${ids.length} payment${ids.length === 1 ? "" : "s"}.`);
  }

  async function bulkExplain() {
    const note = bulkNote.trim();
    if (!note) return;
    const replacing = rows.filter((r) => selected.has(r.id) && r.explanation?.trim()).length;
    if (replacing && !confirm(`${replacing} of the selected payments already have an explanation. Replace it?`)) return;
    await bulk({ explanation: note }, "Explanation added");
    setBulkNote("");
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir(field === "payee" ? "asc" : "desc");
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

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)));
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
          {EXPENSE_CATEGORIES.filter((c) => c.direction === "out").map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select aria-label="Status" className={select} value={status} onChange={(e) => setStatus(e.target.value as "all" | ExpenseStatus)}>
          <option value="all">All statuses</option>
          {EXPENSE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select aria-label="Event or tag" className={select} value={link} onChange={(e) => setLink(e.target.value)}>
          <option value="all">All events and tags</option>
          <option value="none">No event or tag</option>
          {linkOptions.projects.length > 0 && (
            <optgroup label="Projects and events">
              {linkOptions.projects.map(([id, label]) => (
                <option key={id} value={`p:${id}`}>
                  {label}
                </option>
              ))}
            </optgroup>
          )}
          {linkOptions.tags.length > 0 && (
            <optgroup label="Tags">
              {linkOptions.tags.map((t) => (
                <option key={t} value={`t:${t}`}>
                  {t}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <input className="min-w-[12rem] flex-1 rounded border px-3 py-1.5 text-sm" placeholder="Search payee, reference, note or amount" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input type="checkbox" checked={hideOwn} onChange={(e) => setHideOwn(e.target.checked)} /> Hide own-account transfers
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Money out" value={sumOf(scoped)} sub={`${scoped.length} payment${scoped.length === 1 ? "" : "s"}`} />
        <SummaryCard
          label="Done"
          value={sumOf(done)}
          sub={`${done.length} with documents or explanation`}
          tone="emerald"
          active={status === "done"}
          onClick={() => setStatus((s) => (s === "done" ? "all" : "done"))}
        />
        <SummaryCard
          label="Needs receipt or explanation"
          value={sumOf(attention)}
          sub={`${attention.length} payment${attention.length === 1 ? "" : "s"}`}
          tone="amber"
          active={status === "needs_attention"}
          onClick={() => setStatus((s) => (s === "needs_attention" ? "all" : "needs_attention"))}
        />
        <SummaryCard
          label="Own-account transfers"
          value={sumOf(ownTransfers)}
          sub="Between the company's accounts, not an expense"
          active={category === "own_transfer"}
          onClick={() => setCategory((c) => (c === "own_transfer" ? "all" : "own_transfer"))}
        />
      </div>

      {byCategory.length > 0 && (
        <div className="rounded border bg-white p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">By category</p>
          <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
            {byCategory.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory((prev) => (prev === c.key ? "all" : c.key))}
                className={cn("flex items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-neutral-50", category === c.key && "bg-neutral-100")}
              >
                <span className="w-44 truncate">{c.key === "none" ? "Uncategorised" : EXPENSE_CATEGORY_LABEL[c.key]}</span>
                <span className="h-2 flex-1 overflow-hidden rounded bg-neutral-100">
                  <span className="block h-full bg-neutral-700" style={{ width: `${Math.max(2, (c.amount / (byCategory[0].amount || 1)) * 100)}%` }} />
                </span>
                <span className="w-24 text-right tabular-nums">{formatRM(c.amount)}</span>
                <span className="w-8 text-right text-neutral-400">{c.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
            {EXPENSE_CATEGORIES.filter((c) => c.direction === "out").map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <TagProjectPicker
            projectId={null}
            tag={null}
            projects={projects}
            tags={tags}
            clearable
            placeholder="Set event or tag..."
            className="border-white/40 bg-white py-1.5 text-sm text-neutral-900"
            onChange={(v: LinkValue) => bulk(v, v.project_id || v.tag ? "Linked" : "Cleared event and tag")}
          />
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
          No bank transactions for {year} yet.{" "}
          <Link href="/expenses/statements" className="underline">
            Upload bank statements
          </Link>{" "}
          to list the payments out.
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-neutral-500">No payments match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-neutral-50">
              <tr>
                <th className="w-8 p-2">
                  <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} />
                </th>
                <Th field="txn_date" label="Date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <th className="p-2 text-left">Account</th>
                <Th field="payee" label="Paid to" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                <Th field="amount" label="Amount (RM)" sortField={sortField} sortDir={sortDir} onSort={toggleSort} align="right" />
                <th className="p-2 text-left">Category</th>
                <th className="p-2 text-left">Event / tag</th>
                <th className="p-2 text-center">Docs</th>
                <th className="p-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer border-b last:border-0 hover:bg-neutral-50">
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label="Select payment" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} />
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
                    <CategorySelect value={r.category} onChange={(v) => chooseCategory(r, v)} muted={r.category_source !== "user"} />
                  </td>
                  <td className="max-w-[14rem] p-2" onClick={(e) => e.stopPropagation()}>
                    <TagProjectPicker projectId={r.project_id} tag={r.tag} projects={projects} tags={tags} onChange={(v) => patchRows([r.id], v)} />
                  </td>
                  <td className="p-2 text-center text-neutral-500">
                    {r.doc_count ? (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="size-3" />
                        {r.doc_count}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-2">
                    <ExpenseStatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-neutral-50 font-medium">
              <tr>
                <td className="p-2" colSpan={4}>
                  {visible.length} payment{visible.length === 1 ? "" : "s"}
                </td>
                <td className="p-2 text-right tabular-nums">{formatRM(sumOf(visible))}</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <ExpenseSheet
        row={openRow}
        onClose={() => setOpenId(null)}
        projects={projects}
        tags={tags}
        onPatch={(patch) => (openRow ? patchRows([openRow.id], patch) : Promise.resolve(false))}
        onCategory={(value) => openRow && chooseCategory(openRow, value)}
        onDocCount={(count) => openRow && setDocCount(openRow.id, count)}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  sub: string;
  tone?: "emerald" | "amber";
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded border bg-white p-3 text-left disabled:cursor-default",
        onClick && "hover:border-neutral-400",
        active && "border-neutral-900 ring-1 ring-neutral-900"
      )}
    >
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tone === "emerald" && "text-emerald-700", tone === "amber" && "text-amber-700")}>
        RM {formatRM(value)}
      </p>
      <p className="text-xs text-neutral-500">{sub}</p>
    </button>
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
    <th className={cn("cursor-pointer select-none whitespace-nowrap p-2", align === "right" ? "text-right" : "text-left")} onClick={() => onSort(field)}>
      {label} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}
