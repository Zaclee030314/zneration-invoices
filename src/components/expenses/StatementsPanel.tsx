"use client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Upload } from "lucide-react";
import type { BankAccount, BankStatement } from "@/lib/types";
import { formatDate } from "@/lib/labels";
import { formatRM } from "@/lib/company";
import { accountLabel } from "@/lib/expenses";
import { openAttachment } from "@/lib/attachments";
import { deleteStatement, fetchAccounts, fetchMonthlyCounts, fetchStatements, updateAccountLabel } from "@/lib/queries/expenses";
import { memberName, useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatementImportDialog } from "./StatementImportDialog";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;

type Coverage = "full" | "partial" | "none";

// How much of a calendar month the account's statements cover.
function monthCoverage(statements: BankStatement[], year: number, month: number): Coverage {
  const first = Date.UTC(year, month, 1);
  const last = Date.UTC(year, month + 1, 0);
  const days = new Set<number>();
  for (const s of statements) {
    const from = Math.max(Date.parse(s.period_start), first);
    const to = Math.min(Date.parse(s.period_end), last);
    for (let t = from; t <= to; t += DAY) days.add(t);
  }
  if (!days.size) return "none";
  return days.size >= (last - first) / DAY + 1 ? "full" : "partial";
}

const COVERAGE_STYLE: Record<Coverage, string> = {
  full: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  none: "bg-neutral-100 text-neutral-400",
};

export function StatementsPanel() {
  const { members } = useWorkspace();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchAccounts(), fetchStatements(), fetchMonthlyCounts(year)]).then(([a, s, c]) => {
      if (cancelled) return;
      const error = a.error ?? s.error ?? c.error;
      if (error) toast.error(error);
      setAccounts(a.data ?? []);
      setStatements(s.data ?? []);
      setCounts(c.data ?? {});
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [year, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const accountById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);
  const yearStatements = useMemo(
    () => statements.filter((s) => s.period_start <= `${year}-12-31` && s.period_end >= `${year}-01-01`),
    [statements, year]
  );

  async function rename(a: BankAccount) {
    const next = prompt("Name for this account, for example UOB Main", accountLabel(a));
    if (next === null) return;
    const label = next.trim() || null;
    const res = await updateAccountLabel(a.id, label);
    if (res.error !== null) return toast.error(res.error);
    setAccounts((prev) => prev.map((x) => (x.id === a.id ? { ...x, label } : x)));
  }

  async function remove(s: BankStatement) {
    const period = `${formatDate(s.period_start)} – ${formatDate(s.period_end)}`;
    if (!confirm(`Delete the statement "${s.file_name}" (${period})?\n\nIts transactions are removed too, unless another statement also covers them.`)) return;
    setDeletingId(s.id);
    const res = await deleteStatement(s.id);
    setDeletingId(null);
    if (res.error !== null) return toast.error(res.error);
    const { deleted, kept } = res.data;
    toast.success(`Statement deleted. ${deleted} transaction${deleted === 1 ? "" : "s"} removed${kept ? `, ${kept} kept because another statement covers them` : ""}.`);
    reload();
  }

  async function view(s: BankStatement) {
    const error = await openAttachment(s.file_path);
    if (error) toast.error(error);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="Year" className="rounded border bg-white px-2 py-1.5 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <p className="text-sm text-neutral-500">Upload every month&apos;s statement for each account. Green months are fully covered.</p>
        </div>
        <Button type="button" onClick={() => setImportOpen(true)}>
          <Upload /> Upload statements
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : accounts.length === 0 ? (
        <div className="rounded border bg-white p-6 text-sm text-neutral-600">
          No statements yet. Upload the UOB Account Activities export or the Public Bank statement PDF; the bank account is added automatically.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded border bg-white">
            <table className="w-full text-sm">
              <thead className="border-b bg-neutral-50">
                <tr>
                  <th className="p-2 text-left">Account</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="p-2 text-center font-normal text-neutral-500">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => {
                  const own = statements.filter((s) => s.account_id === a.id);
                  return (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap p-2">
                        <div className="flex items-center gap-1 font-medium">
                          {accountLabel(a)}
                          <button type="button" onClick={() => rename(a)} className="text-neutral-400 hover:text-neutral-700" aria-label="Rename account">
                            <Pencil className="size-3" />
                          </button>
                        </div>
                        <div className="text-xs text-neutral-500">
                          {a.bank === "PBB" ? "Public Bank" : "UOB"} {a.account_no}
                        </div>
                      </td>
                      {MONTHS.map((m, i) => {
                        const coverage = monthCoverage(own, year, i);
                        const count = counts[`${a.id}|${year}-${String(i + 1).padStart(2, "0")}`] ?? 0;
                        return (
                          <td key={m} className="p-1">
                            <div
                              className={cn("rounded py-2 text-center text-xs tabular-nums", COVERAGE_STYLE[coverage])}
                              title={
                                coverage === "none"
                                  ? `No statement for ${m} ${year}`
                                  : `${count} transaction${count === 1 ? "" : "s"}${coverage === "partial" ? ", statement covers part of the month" : ""}`
                              }
                            >
                              {coverage === "none" ? "—" : count}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-4 border-t px-3 py-2 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded bg-emerald-100" /> Whole month covered (number of transactions)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded bg-amber-100" /> Part of the month
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded bg-neutral-100" /> Missing
              </span>
            </div>
          </div>

          {yearStatements.length === 0 ? (
            <p className="text-sm text-neutral-500">No statements for {year}.</p>
          ) : (
            <div className="overflow-x-auto rounded border bg-white">
              <table className="w-full text-sm">
                <thead className="border-b bg-neutral-50">
                  <tr>
                    <th className="p-2 text-left">Period</th>
                    <th className="p-2 text-left">Account</th>
                    <th className="p-2 text-left">File</th>
                    <th className="p-2 text-right">Transactions</th>
                    <th className="p-2 text-right">In (RM)</th>
                    <th className="p-2 text-right">Out (RM)</th>
                    <th className="p-2 text-right">Opening → closing</th>
                    <th className="p-2 text-left">Checks</th>
                    <th className="p-2 text-left">Uploaded</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {yearStatements.map((s) => {
                    const account = accountById[s.account_id];
                    const checks = s.validation?.checks ?? [];
                    const failed = checks.filter((c) => !c.ok);
                    const warnings = s.validation?.warnings ?? [];
                    const uploader = members.find((m) => m.user_id === s.uploaded_by);
                    return (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-neutral-50">
                        <td className="whitespace-nowrap p-2">
                          {formatDate(s.period_start)} – {formatDate(s.period_end)}
                        </td>
                        <td className="whitespace-nowrap p-2">{account ? accountLabel(account) : "—"}</td>
                        <td className="max-w-[14rem] p-2">
                          <button type="button" onClick={() => view(s)} className="block max-w-full truncate text-left hover:underline">
                            {s.file_name}
                          </button>
                        </td>
                        <td className="whitespace-nowrap p-2 text-right tabular-nums">
                          {s.txn_count}
                          {s.duplicate_count > 0 && <span className="block text-xs text-neutral-500">{s.inserted_count} new, {s.duplicate_count} already in</span>}
                        </td>
                        <td className="whitespace-nowrap p-2 text-right tabular-nums">{formatRM(Number(s.total_in))}</td>
                        <td className="whitespace-nowrap p-2 text-right tabular-nums">{formatRM(Number(s.total_out))}</td>
                        <td className="whitespace-nowrap p-2 text-right tabular-nums">
                          {formatRM(Number(s.opening_balance))} → {formatRM(Number(s.closing_balance))}
                        </td>
                        <td
                          className={cn("whitespace-nowrap p-2 text-xs", failed.length ? "text-red-700" : "text-emerald-700")}
                          title={[...checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.message}`), ...warnings.map((w) => `! ${w}`)].join("\n")}
                        >
                          {failed.length ? `${failed.length} failed` : `✓ ${checks.length} passed`}
                          {warnings.length > 0 && <span className="text-amber-700"> · {warnings.length} note{warnings.length === 1 ? "" : "s"}</span>}
                        </td>
                        <td className="whitespace-nowrap p-2 text-xs text-neutral-500">
                          {uploader ? memberName(uploader) : ""}
                          <span className="block">{formatDate(s.created_at)}</span>
                        </td>
                        <td className="p-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            disabled={deletingId === s.id}
                            onClick={() => remove(s)}
                            aria-label="Delete statement"
                          >
                            <Trash2 />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <StatementImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={reload} />
    </div>
  );
}
