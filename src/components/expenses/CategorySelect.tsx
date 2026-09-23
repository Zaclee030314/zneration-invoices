"use client";
import type { TxnCategory } from "@/lib/types";
import { EXPENSE_CATEGORIES } from "@/lib/labels";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NONE = "__none__";

// `muted` marks a category the app suggested rather than one a person chose.
export function CategorySelect({
  value,
  onChange,
  direction = "out",
  muted,
  className,
}: {
  value: TxnCategory | null;
  onChange: (value: TxnCategory | null) => void;
  direction?: "in" | "out";
  muted?: boolean;
  className?: string;
}) {
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : (v as TxnCategory))}>
      <SelectTrigger className={cn("h-8 text-xs", (muted || !value) && "text-neutral-500", muted && value && "italic", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Uncategorised</SelectItem>
        {EXPENSE_CATEGORIES.filter((c) => c.directions.includes(direction) || c.value === value).map((c) => (
          <SelectItem key={c.value} value={c.value}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
