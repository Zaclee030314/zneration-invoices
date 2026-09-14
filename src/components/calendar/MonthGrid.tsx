"use client";
import { useMemo, useState } from "react";
import { addDays, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ContentChip } from "./ContentChip";
import { cn } from "@/lib/utils";
import type { ContentItemWithRefs } from "@/lib/queries/content";

const MAX_VISIBLE = 4;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// First Monday on/before the 1st of the month; the grid is always 6 rows.
export function gridStart(month: Date): Date {
  return startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
}

export function MonthGrid({
  month,
  items,
  onSelectItem,
  onSelectDate,
}: {
  month: Date;
  items: ContentItemWithRefs[];
  onSelectItem: (item: ContentItemWithRefs) => void;
  onSelectDate: (dateIso: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const start = gridStart(month);
  const today = new Date();

  const byDate = useMemo(() => {
    const map = new Map<string, ContentItemWithRefs[]>();
    for (const it of items) {
      const list = map.get(it.due_date) ?? [];
      list.push(it);
      map.set(it.due_date, list);
    }
    return map;
  }, [items]);

  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));

  return (
    <div className="bg-white border rounded overflow-hidden">
      <div className="grid grid-cols-7 border-b bg-neutral-50">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 auto-rows-[minmax(112px,auto)]">
        {cells.map((date, i) => {
          const iso = format(date, "yyyy-MM-dd");
          const inMonth = isSameMonth(date, month);
          const isToday = isSameDay(date, today);
          const list = byDate.get(iso) ?? [];
          const open = expanded.has(iso);
          const visible = open ? list : list.slice(0, MAX_VISIBLE);
          const hidden = list.length - visible.length;
          return (
            <div
              key={iso}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDate(iso)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSelectDate(iso);
              }}
              className={cn(
                "border-b border-r p-1.5 flex flex-col gap-1 cursor-pointer hover:bg-neutral-50/80 focus:outline-none focus:bg-neutral-50",
                i % 7 === 6 && "border-r-0",
                i >= 35 && "border-b-0",
                !inMonth && "bg-neutral-50/60"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs",
                    isToday ? "bg-neutral-900 text-white font-medium" : inMonth ? "text-neutral-700" : "text-neutral-300"
                  )}
                >
                  {format(date, "d")}
                </span>
                {list.length > 0 && <span className="text-[10px] text-neutral-400">{list.length}</span>}
              </div>
              <div className={cn("flex flex-col gap-0.5", !inMonth && "opacity-60")}>
                {visible.map((it) => (
                  <ContentChip key={it.id} item={it} onClick={() => onSelectItem(it)} />
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    className="text-left text-[11px] text-neutral-500 hover:text-neutral-900 px-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded((s) => new Set(s).add(iso));
                    }}
                  >
                    +{hidden} more
                  </button>
                )}
                {open && list.length > MAX_VISIBLE && (
                  <button
                    type="button"
                    className="text-left text-[11px] text-neutral-400 hover:text-neutral-900 px-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded((s) => {
                        const n = new Set(s);
                        n.delete(iso);
                        return n;
                      });
                    }}
                  >
                    Show less
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
