"use client";
import { addMonths, format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectPicker } from "@/components/ProjectPicker";
import { CONTENT_CHANNELS, CONTENT_STATUSES } from "@/lib/labels";
import { memberName, type Member } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import type { ContentChannel, ContentStatus } from "@/lib/types";

const ALL = "__all__";

export type CalendarView = "month" | "list";

export interface ContentFilters {
  projectId: string | null;
  channel: ContentChannel | null;
  status: ContentStatus | null;
  assigneeId: string | null;
}

export function CalendarToolbar({
  month,
  onMonthChange,
  view,
  onViewChange,
  filters,
  onFiltersChange,
  members,
  showProjectFilter = true,
  onNew,
}: {
  month: Date;
  onMonthChange: (m: Date) => void;
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  filters: ContentFilters;
  onFiltersChange: (f: ContentFilters) => void;
  members: Member[];
  showProjectFilter?: boolean;
  onNew: () => void;
}) {
  const now = new Date();
  return (
    <div className="space-y-3 mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onMonthChange(addMonths(month, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => onMonthChange(new Date(now.getFullYear(), now.getMonth(), 1))}>
            Today
          </Button>
        </div>
        <p className="text-base font-medium ml-1">{format(month, "MMMM yyyy")}</p>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded border bg-white p-0.5">
            <ViewButton active={view === "month"} onClick={() => onViewChange("month")} icon={CalendarDays} label="Month" />
            <ViewButton active={view === "list"} onClick={() => onViewChange("list")} icon={List} label="List" />
          </div>
          <Button size="sm" className="h-8" onClick={onNew}>
            <Plus className="h-4 w-4 mr-1.5" /> New item
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {showProjectFilter && (
          <div className="w-64">
            <ProjectPicker value={filters.projectId} placeholder="All projects" onSelect={(p) => onFiltersChange({ ...filters, projectId: p?.id ?? null })} />
          </div>
        )}
        <Select value={filters.channel ?? ALL} onValueChange={(v) => onFiltersChange({ ...filters, channel: v === ALL ? null : (v as ContentChannel) })}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All channels</SelectItem>
            {CONTENT_CHANNELS.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.status ?? ALL} onValueChange={(v) => onFiltersChange({ ...filters, status: v === ALL ? null : (v as ContentStatus) })}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {CONTENT_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.assigneeId ?? ALL} onValueChange={(v) => onFiltersChange({ ...filters, assigneeId: v === ALL ? null : v })}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Anyone</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {memberName(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filters.projectId || filters.channel || filters.status || filters.assigneeId) && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => onFiltersChange({ projectId: showProjectFilter ? null : filters.projectId, channel: null, status: null, assigneeId: null })}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

function ViewButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof CalendarDays; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-1 text-xs",
        active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
