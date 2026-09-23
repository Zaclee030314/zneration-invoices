import type { ExpenseStatus, ReceivedStatus } from "@/lib/types";
import { EXPENSE_STATUS_COLOR, EXPENSE_STATUS_LABEL, RECEIVED_STATUS_COLOR, RECEIVED_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

const LABEL: Record<string, string> = { ...EXPENSE_STATUS_LABEL, ...RECEIVED_STATUS_LABEL };
const COLOR: Record<string, string> = { ...EXPENSE_STATUS_COLOR, ...RECEIVED_STATUS_COLOR };

export function ExpenseStatusBadge({ status, className }: { status: ExpenseStatus | ReceivedStatus | null; className?: string }) {
  if (!status) return null;
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", COLOR[status], className)}>
      {LABEL[status]}
    </span>
  );
}
