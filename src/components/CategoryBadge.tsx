import type { InvoiceCategory } from "@/lib/types";

const STYLES: Record<InvoiceCategory, string> = {
  EVIV: "bg-amber-100 text-amber-800",
  ZMIV: "bg-sky-100 text-sky-800",
};

export function CategoryBadge({ category }: { category: InvoiceCategory }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STYLES[category]}`}>
      {category}
    </span>
  );
}
