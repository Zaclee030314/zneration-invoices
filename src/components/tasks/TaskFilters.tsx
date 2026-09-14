"use client";
import { Search } from "lucide-react";
import type { Milestone, Priority } from "@/lib/types";
import { PRIORITIES } from "@/lib/labels";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface TaskFilterValues {
  mine: boolean;
  milestoneId: string | null; // "none" = tasks without a milestone
  priority: Priority | null;
  search: string;
}

export const EMPTY_TASK_FILTERS: TaskFilterValues = { mine: false, milestoneId: null, priority: null, search: "" };

export function TaskFilters({
  value,
  onChange,
  milestones,
}: {
  value: TaskFilterValues;
  onChange: (next: TaskFilterValues) => void;
  milestones: Milestone[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange({ ...value, mine: !value.mine })}
        className={cn("h-8 px-3 rounded-md border text-xs font-medium", value.mine ? "bg-neutral-900 text-white border-neutral-900" : "bg-white hover:bg-neutral-50")}
      >
        My tasks
      </button>
      <Select value={value.milestoneId ?? "all"} onValueChange={(v) => onChange({ ...value, milestoneId: v === "all" ? null : v })}>
        <SelectTrigger className="h-8 w-44 bg-white text-xs">
          <SelectValue placeholder="Milestone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All milestones</SelectItem>
          <SelectItem value="none">No milestone</SelectItem>
          {milestones.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value.priority ?? "all"} onValueChange={(v) => onChange({ ...value, priority: v === "all" ? null : (v as Priority) })}>
        <SelectTrigger className="h-8 w-36 bg-white text-xs">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any priority</SelectItem>
          {PRIORITIES.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative">
        <Search className="absolute left-2 top-2 h-4 w-4 text-neutral-400" />
        <input
          className="h-8 w-52 border rounded-md bg-white pl-7 pr-2 text-xs"
          placeholder="Search tasks"
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
        />
      </div>
      {(value.mine || value.milestoneId || value.priority || value.search) && (
        <button type="button" onClick={() => onChange(EMPTY_TASK_FILTERS)} className="text-xs text-neutral-500 hover:underline">
          Clear
        </button>
      )}
    </div>
  );
}

// Applies the filters client-side to an already-loaded task list.
export function applyTaskFilters<T extends { assignee_id: string | null; milestone_id: string | null; priority: Priority; title: string }>(
  tasks: T[],
  f: TaskFilterValues,
  userId: string | null
): T[] {
  const q = f.search.trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.mine && t.assignee_id !== userId) return false;
    if (f.milestoneId === "none" && t.milestone_id) return false;
    if (f.milestoneId && f.milestoneId !== "none" && t.milestone_id !== f.milestoneId) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (q && !t.title.toLowerCase().includes(q)) return false;
    return true;
  });
}
