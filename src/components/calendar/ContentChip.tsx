"use client";
import { CHANNEL_COLOR, CHANNEL_LABEL, CONTENT_STATUS_DOT, CONTENT_STATUS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ContentItem } from "@/lib/types";

// One calendar-cell pill: channel colour, status dot, truncated title.
export function ContentChip({ item, onClick }: { item: ContentItem; onClick: (item: ContentItem) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(item);
      }}
      title={`${item.title} · ${CHANNEL_LABEL[item.channel]} · ${CONTENT_STATUS_LABEL[item.status]}`}
      className={cn(
        "w-full flex items-center gap-1 rounded border px-1.5 py-0.5 text-left text-[11px] leading-4 hover:brightness-95",
        CHANNEL_COLOR[item.channel],
        item.status === "cancelled" && "opacity-50 line-through"
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", CONTENT_STATUS_DOT[item.status])} />
      <span className="truncate">{item.title}</span>
    </button>
  );
}
