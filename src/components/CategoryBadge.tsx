"use client";
import type { InvoiceCategory } from "@/lib/types";
import { findSeries, type SeriesColor } from "@/lib/company";
import { useWorkspace } from "@/lib/workspace";

export const SERIES_COLOR_CLASS: Record<SeriesColor, string> = {
  amber: "bg-amber-100 text-amber-800",
  sky: "bg-sky-100 text-sky-800",
  emerald: "bg-emerald-100 text-emerald-800",
  violet: "bg-violet-100 text-violet-800",
  rose: "bg-rose-100 text-rose-800",
  teal: "bg-teal-100 text-teal-800",
  orange: "bg-orange-100 text-orange-800",
  neutral: "bg-neutral-100 text-neutral-700",
};

export function CategoryBadge({ category }: { category: InvoiceCategory }) {
  const { company } = useWorkspace();
  const series = findSeries(company.series, category);
  return (
    <span title={series?.label} className={`text-xs font-medium px-2 py-0.5 rounded-full ${SERIES_COLOR_CLASS[series?.color ?? "neutral"]}`}>
      {category}
    </span>
  );
}
