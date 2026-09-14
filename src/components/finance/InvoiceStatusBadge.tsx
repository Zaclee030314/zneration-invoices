import { INVOICE_STATUS_COLOR, INVOICE_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/types";

export function InvoiceStatusBadge({ status, className }: { status: InvoiceStatus | null | undefined; className?: string }) {
  if (!status) return <span className={cn("text-xs text-neutral-400", className)}>—</span>;
  return (
    <span className={cn("inline-block text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap", INVOICE_STATUS_COLOR[status], className)}>
      {INVOICE_STATUS_LABEL[status]}
    </span>
  );
}
