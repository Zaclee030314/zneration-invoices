"use client";
import { formatDistanceToNow } from "date-fns";
import type { ActivityEntry, ProjectStage, TaskStatus } from "@/lib/types";
import { STAGE_LABEL, TASK_STATUS_LABEL } from "@/lib/labels";
import { memberName, useWorkspace, type Member } from "@/lib/workspace";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Turns an activity_log row into a human sentence, e.g.
// "Zac moved 'Fix login' to In progress".
export function describeActivity(entry: ActivityEntry, members: Member[]): string {
  const byId = new Map(members.map((m) => [m.user_id, m]));
  const actor = entry.actor_id ? memberName(byId.get(entry.actor_id)) : "Someone";
  const d = entry.data ?? {};
  if (entry.entity_type === "task") {
    const title = str(d.title) || "a task";
    if (entry.action === "created") return `${actor} created task '${title}'`;
    if (entry.action === "status_changed") return `${actor} moved '${title}' to ${TASK_STATUS_LABEL[str(d.to) as TaskStatus] ?? str(d.to)}`;
    if (entry.action === "assigned") {
      const to = str(d.to);
      return to ? `${actor} assigned '${title}' to ${memberName(byId.get(to))}` : `${actor} unassigned '${title}'`;
    }
  }
  if (entry.entity_type === "project") {
    const name = str(d.name) || "a project";
    if (entry.action === "created") return `${actor} created project '${name}'`;
    if (entry.action === "stage_changed") return `${actor} moved project '${name}' to ${STAGE_LABEL[str(d.to) as ProjectStage] ?? str(d.to)}`;
  }
  if (entry.entity_type === "payment" && entry.action === "payment_recorded") {
    const amt = Number(d.amount);
    const no = str(d.invoice_no);
    return `${actor} recorded a payment${Number.isFinite(amt) ? ` of RM ${amt.toLocaleString("en-MY", { minimumFractionDigits: 2 })}` : ""}${no ? ` on ${no}` : ""}`;
  }
  return `${actor} ${entry.action.replace(/_/g, " ")} ${entry.entity_type.replace(/_/g, " ")}`;
}

export function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export function ActivityList({
  entries,
  loading,
  projectLabel,
  emptyLabel = "No activity yet.",
}: {
  entries: ActivityEntry[];
  loading?: boolean;
  // Optional suffix per entry (dashboard shows the project name).
  projectLabel?: (entry: ActivityEntry) => string | null;
  emptyLabel?: string;
}) {
  const { members } = useWorkspace();
  if (loading) return <p className="text-sm text-neutral-500">Loading...</p>;
  if (entries.length === 0) return <p className="text-sm text-neutral-500">{emptyLabel}</p>;
  return (
    <ul className="divide-y">
      {entries.map((e) => {
        const label = projectLabel?.(e);
        return (
          <li key={e.id} className="py-2 text-sm flex items-start justify-between gap-3">
            <span className="min-w-0">
              {describeActivity(e, members)}
              {label && <span className="text-neutral-400"> · {label}</span>}
            </span>
            <span className="text-xs text-neutral-400 whitespace-nowrap shrink-0">{relativeTime(e.created_at)}</span>
          </li>
        );
      })}
    </ul>
  );
}
