"use client";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { Milestone, Task, TaskStatus } from "@/lib/types";
import { TASK_STATUSES } from "@/lib/labels";
import { useWorkspace } from "@/lib/workspace";
import { moveTask } from "@/lib/queries/tasks";
import { Board, type BoardColumn, type BoardItem, type BoardNeighbours } from "@/components/board/Board";
import { TaskCard } from "./TaskCard";

const COLUMNS: BoardColumn[] = TASK_STATUSES.map((s) => ({ id: s.value, label: s.label, color: s.color }));

export function TaskBoard({
  tasks,
  milestones,
  onOpen,
  onMoved,
  onReload,
}: {
  tasks: Task[];
  milestones: Milestone[];
  onOpen: (task: Task) => void;
  // Called after a successful persist so the parent can update its copy.
  onMoved: (taskId: string, status: TaskStatus, position: number) => void;
  onReload: () => void;
}) {
  const { members } = useWorkspace();
  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const milestoneById = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones]);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const items = useMemo<BoardItem[]>(() => tasks.map((t) => ({ id: t.id, columnId: t.status, position: t.position })), [tasks]);

  const renderCard = useCallback(
    (id: string) => {
      const t = taskById.get(id);
      if (!t) return null;
      return (
        <TaskCard
          task={t}
          assignee={t.assignee_id ? memberById.get(t.assignee_id) : undefined}
          milestoneName={t.milestone_id ? milestoneById.get(t.milestone_id)?.title : null}
          onClick={() => onOpen(t)}
        />
      );
    },
    [taskById, memberById, milestoneById, onOpen]
  );

  const handleMove = useCallback(
    async (itemId: string, toColumnId: string, newPosition: number, neighbours: BoardNeighbours) => {
      const t = taskById.get(itemId);
      if (!t) return;
      try {
        const renormalized = await moveTask(t, toColumnId as TaskStatus, newPosition, neighbours);
        onMoved(itemId, toColumnId as TaskStatus, newPosition);
        if (renormalized) onReload();
      } catch (e) {
        toast.error((e as Error).message);
        onReload();
        throw e;
      }
    },
    [taskById, onMoved, onReload]
  );

  return <Board columns={COLUMNS} items={items} renderCard={renderCard} onMove={handleMove} emptyLabel="No tasks" />;
}
