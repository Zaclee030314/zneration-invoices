"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Kanban, List, Plus } from "lucide-react";
import type { Task, TaskStatus } from "@/lib/types";
import { useProject } from "@/lib/project-context";
import { useWorkspace } from "@/lib/workspace";
import { listTasks } from "@/lib/queries/tasks";
import { Button } from "@/components/ui/button";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { TaskListView } from "@/components/tasks/TaskListView";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import { TaskFilters, EMPTY_TASK_FILTERS, applyTaskFilters, type TaskFilterValues } from "@/components/tasks/TaskFilters";
import { cn } from "@/lib/utils";

export default function TasksPage() {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading...</p>}>
      <TasksInner />
    </Suspense>
  );
}

function TasksInner() {
  const { project, milestones, loading: projectLoading } = useProject();
  const { userId } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view: "board" | "list" = searchParams.get("view") === "list" ? "list" : "board";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TaskFilterValues>(EMPTY_TASK_FILTERS);
  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });

  const projectId = project?.id ?? null;

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setTasks(await listTasks(projectId));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => applyTaskFilters(tasks, filters, userId), [tasks, filters, userId]);

  function setView(v: "board" | "list") {
    const params = new URLSearchParams(searchParams.toString());
    if (v === "list") params.set("view", "list");
    else params.delete("view");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const upsertLocal = useCallback((t: Task) => setTasks((prev) => (prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [...prev, t])), []);
  const onMoved = useCallback(
    (id: string, status: TaskStatus, position: number) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status, position } : t))),
    []
  );
  const openTask = useCallback((t: Task) => setDialog({ open: true, task: t }), []);

  if (projectLoading || !project) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TaskFilters value={filters} onChange={setFilters} milestones={milestones} />
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-white p-0.5">
            <ViewButton active={view === "board"} onClick={() => setView("board")} icon={<Kanban className="h-3.5 w-3.5" />} label="Board" />
            <ViewButton active={view === "list"} onClick={() => setView("list")} icon={<List className="h-3.5 w-3.5" />} label="List" />
          </div>
          <Button size="sm" onClick={() => setDialog({ open: true, task: null })}>
            <Plus /> New task
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <div className="bg-white border rounded p-8 text-center text-sm text-neutral-500">
          No tasks yet.{" "}
          <button className="underline" onClick={() => setDialog({ open: true, task: null })}>
            Create the first one
          </button>
          .
        </div>
      ) : view === "list" ? (
        <TaskListView tasks={visible} milestones={milestones} onOpen={openTask} onUpdated={upsertLocal} />
      ) : (
        <TaskBoard tasks={visible} milestones={milestones} onOpen={openTask} onMoved={onMoved} onReload={load} />
      )}

      <TaskDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        projectId={project.id}
        task={dialog.task}
        milestones={milestones}
        onSaved={upsertLocal}
        onDeleted={(id) => setTasks((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}

function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 px-2.5 h-7 rounded text-xs font-medium", active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100")}
    >
      {icon}
      {label}
    </button>
  );
}
