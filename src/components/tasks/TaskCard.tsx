"use client";
import { CalendarDays } from "lucide-react";
import type { Task } from "@/lib/types";
import { PRIORITY_DOT, PRIORITY_LABEL, formatDate, todayIso } from "@/lib/labels";
import { memberName, type Member } from "@/lib/workspace";
import { StartTimerButton } from "@/components/time/StartTimerButton";
import { cn } from "@/lib/utils";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function MemberAvatar({ member, size = "sm" }: { member: Member | undefined; size?: "sm" | "xs" }) {
  const name = memberName(member);
  const dim = size === "xs" ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]";
  return (
    <span
      title={name}
      className={cn("inline-flex items-center justify-center rounded-full bg-neutral-200 text-neutral-700 font-medium shrink-0", dim)}
    >
      {member ? initials(name) : "–"}
    </span>
  );
}

export function isOverdue(task: Pick<Task, "due_date" | "status">): boolean {
  return !!task.due_date && task.status !== "done" && task.due_date < todayIso();
}

export function TaskCard({
  task,
  assignee,
  milestoneName,
  onClick,
}: {
  task: Task;
  assignee?: Member;
  milestoneName?: string | null;
  onClick?: () => void;
}) {
  const overdue = isOverdue(task);
  return (
    <div
      onClick={onClick}
      className="group relative bg-white border rounded p-2.5 text-sm cursor-pointer hover:border-neutral-400 transition-colors select-none"
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[task.priority])} title={PRIORITY_LABEL[task.priority]} />
        <p className={cn("flex-1 leading-snug break-words", task.status === "done" && "line-through text-neutral-500")}>{task.title}</p>
      </div>
      {milestoneName && <p className="mt-1 text-xs text-neutral-500 truncate pl-4">{milestoneName}</p>}
      {task.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 pl-4">
          {task.labels.map((l) => (
            <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">
              {l}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 pl-4">
        <span className={cn("text-xs flex items-center gap-1", overdue ? "text-red-600 font-medium" : "text-neutral-500")}>
          {task.due_date && (
            <>
              <CalendarDays className="h-3 w-3" />
              {formatDate(task.due_date)}
            </>
          )}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <StartTimerButton projectId={task.project_id} taskId={task.id} size="icon" />
          </span>
          {task.assignee_id && <MemberAvatar member={assignee} size="xs" />}
        </span>
      </div>
    </div>
  );
}
