"use client";
import { formatRM } from "@/lib/company";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export function SummaryCard({
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

export function SortTh<F extends string>({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  align = "left",
}: {
  field: F;
  label: string;
  sortField: F;
  sortDir: SortDir;
  onSort: (f: F) => void;
  align?: "left" | "right";
}) {
  const active = sortField === field;
  return (
    <th className={cn("cursor-pointer select-none whitespace-nowrap p-2", align === "right" ? "text-right" : "text-left")} onClick={() => onSort(field)}>
      {label} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
    </th>
  );
}
