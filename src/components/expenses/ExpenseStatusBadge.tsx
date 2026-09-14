import type { ExpenseStatus } from "@/lib/types";
import { EXPENSE_STATUS_COLOR, EXPENSE_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function ExpenseStatusBadge({ status, className }: { status: ExpenseStatus | null; className?: string }) {
  if (!status) return null;
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", EXPENSE_STATUS_COLOR[status], className)}>
      {EXPENSE_STATUS_LABEL[status]}
    </span>
  );
}
