"use client";
import { useMemo } from "react";
import { toast } from "sonner";
import type { Milestone, Task, TaskStatus } from "@/lib/types";
import { PRIORITY_DOT, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_COLOR, formatDate } from "@/lib/labels";
import { memberName, useWorkspace } from "@/lib/workspace";
import { updateTask } from "@/lib/queries/tasks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isOverdue } from "./TaskCard";
import { cn } from "@/lib/utils";

const NONE = "__none__";

function byDue(a: Task, b: Task): number {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return a.position - b.position;
}

export function TaskListView({
  tasks,
  milestones,
  onOpen,
  onUpdated,
}: {
  tasks: Task[];
  milestones: Milestone[];
  onOpen: (task: Task) => void;
  onUpdated: (task: Task) => void;
}) {
  const { members } = useWorkspace();

  const groups = useMemo(() => {
    const out: { id: string; title: string; tasks: Task[] }[] = milestones.map((m) => ({ id: m.id, title: m.title, tasks: [] }));
    const none = { id: NONE, title: "No milestone", tasks: [] as Task[] };
    const byId = new Map(out.map((g) => [g.id, g]));
    for (const t of tasks) (t.milestone_id && byId.get(t.milestone_id) ? byId.get(t.milestone_id)! : none).tasks.push(t);
    out.push(none);
    for (const g of out) g.tasks.sort(byDue);
    return out.filter((g) => g.tasks.length > 0);
  }, [tasks, milestones]);

  async function patch(task: Task, input: Partial<Pick<Task, "status" | "assignee_id">>) {
    try {
      onUpdated(await updateTask(task.id, input));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (tasks.length === 0) return <p className="text-sm text-neutral-500">No tasks match.</p>;

  return (
    <div className="bg-white border rounded overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 border-b text-left text-xs text-neutral-500">
          <tr>
            <th className="p-2 font-medium">Task</th>
            <th className="p-2 font-medium w-40">Status</th>
            <th className="p-2 font-medium w-44">Assignee</th>
            <th className="p-2 font-medium w-24">Priority</th>
            <th className="p-2 font-medium w-28">Due</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <GroupRows key={g.id} title={g.title} tasks={g.tasks} onOpen={onOpen} patch={patch} members={members} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  title,
  tasks,
  onOpen,
  patch,
  members,
}: {
  title: string;
  tasks: Task[];
  onOpen: (t: Task) => void;
  patch: (t: Task, input: Partial<Pick<Task, "status" | "assignee_id">>) => Promise<void>;
  members: ReturnType<typeof useWorkspace>["members"];
}) {
  const done = tasks.filter((t) => t.status === "done").length;
  return (
    <>
      <tr className="bg-neutral-50/70 border-b">
        <td colSpan={5} className="px-2 py-1.5 text-xs font-medium text-neutral-600">
          {title} <span className="text-neutral-400 font-normal">· {done}/{tasks.length} done</span>
        </td>
      </tr>
      {tasks.map((t) => (
        <tr key={t.id} className="border-b last:border-0 hover:bg-neutral-50">
          <td className="p-2">
            <button type="button" onClick={() => onOpen(t)} className={cn("text-left hover:underline", t.status === "done" && "line-through text-neutral-500")}>
              {t.title}
            </button>
            {t.labels.length > 0 && (
              <span className="ml-2 inline-flex gap-1">
                {t.labels.map((l) => (
                  <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">{l}</span>
                ))}
              </span>
            )}
          </td>
          <td className="p-2">
            <Select value={t.status} onValueChange={(v) => patch(t, { status: v as TaskStatus })}>
              <SelectTrigger className={cn("h-7 text-xs border-0 shadow-none", TASK_STATUS_COLOR[t.status])}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </td>
          <td className="p-2">
            <Select value={t.assignee_id ?? NONE} onValueChange={(v) => patch(t, { assignee_id: v === NONE ? null : v })}>
              <SelectTrigger className="h-7 text-xs border-0 shadow-none bg-transparent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{memberName(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </td>
          <td className="p-2">
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[t.priority])} />
              {PRIORITY_LABEL[t.priority]}
            </span>
          </td>
          <td className={cn("p-2 text-xs whitespace-nowrap", isOverdue(t) ? "text-red-600 font-medium" : "text-neutral-600")}>
            {formatDate(t.due_date) || <span className="text-neutral-300">–</span>}
          </td>
        </tr>
      ))}
    </>
  );
}
