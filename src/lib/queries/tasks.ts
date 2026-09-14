import { supabase } from "@/lib/supabase/client";
import type { ActivityEntry, Priority, Task, TaskComment, TaskStatus } from "@/lib/types";

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

export interface TaskFilterState {
  assigneeId?: string | null; // "me" resolved to a user id by the caller
  milestoneId?: string | null;
  priority?: Priority | null;
  search?: string;
}

export async function listTasks(projectId: string, filters: TaskFilterState = {}): Promise<Task[]> {
  let q = supabase.from("tasks").select("*").eq("project_id", projectId).order("position").order("created_at");
  if (filters.assigneeId) q = q.eq("assignee_id", filters.assigneeId);
  if (filters.milestoneId) q = q.eq("milestone_id", filters.milestoneId);
  if (filters.priority) q = q.eq("priority", filters.priority);
  if (filters.search?.trim()) q = q.ilike("title", `%${filters.search.trim()}%`);
  const { data, error } = await q;
  fail(error);
  return (data as Task[]) ?? [];
}

export async function getTask(id: string): Promise<Task | null> {
  const { data, error } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  fail(error);
  return (data as Task | null) ?? null;
}

export type TaskInput = {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  assignee_id?: string | null;
  milestone_id?: string | null;
  due_date?: string | null;
  estimate_min?: number | null;
  labels?: string[];
};

function cleanTask(input: Partial<TaskInput>) {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.assignee_id !== undefined) patch.assignee_id = input.assignee_id || null;
  if (input.milestone_id !== undefined) patch.milestone_id = input.milestone_id || null;
  if (input.due_date !== undefined) patch.due_date = input.due_date || null;
  if (input.estimate_min !== undefined) patch.estimate_min = input.estimate_min ?? null;
  if (input.labels !== undefined) patch.labels = input.labels.map((l) => l.trim()).filter(Boolean);
  return patch;
}

// New tasks land at the bottom of their status column.
export async function createTask(projectId: string, input: TaskInput): Promise<Task> {
  const status = input.status ?? "todo";
  const { data: last } = await supabase
    .from("tasks")
    .select("position")
    .eq("project_id", projectId)
    .eq("status", status)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((last as { position: number } | null)?.position ?? 0) + 1000;
  const { data, error } = await supabase
    .from("tasks")
    .insert({ project_id: projectId, ...cleanTask({ ...input, status }), position })
    .select("*")
    .single();
  fail(error);
  return data as Task;
}

export async function updateTask(id: string, input: Partial<TaskInput>): Promise<Task> {
  const { data, error } = await supabase.from("tasks").update(cleanTask(input)).eq("id", id).select("*").single();
  fail(error);
  return data as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  fail(error);
}

// Persists a board move. When the float gap between neighbours collapses the
// column is re-spaced server-side; the caller should refetch afterwards.
// Returns true when a renormalize happened.
export async function moveTask(
  task: Pick<Task, "id" | "project_id">,
  toStatus: TaskStatus,
  position: number,
  neighbours: { prev?: number; next?: number }
): Promise<boolean> {
  const { error } = await supabase.from("tasks").update({ status: toStatus, position }).eq("id", task.id);
  fail(error);
  const tooClose =
    neighbours.prev !== undefined && neighbours.next !== undefined && Math.abs(neighbours.next - neighbours.prev) < 1e-6;
  if (tooClose) {
    const { error: rpcError } = await supabase.rpc("renormalize_task_positions", { p_project: task.project_id, p_status: toStatus });
    fail(rpcError);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Comments + activity
// ---------------------------------------------------------------------------
export async function listComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await supabase.from("task_comments").select("*").eq("task_id", taskId).order("created_at");
  fail(error);
  return (data as TaskComment[]) ?? [];
}

export async function addComment(taskId: string, body: string): Promise<TaskComment> {
  const { data, error } = await supabase.from("task_comments").insert({ task_id: taskId, body: body.trim() }).select("*").single();
  fail(error);
  return data as TaskComment;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from("task_comments").delete().eq("id", id);
  fail(error);
}

export async function listTaskActivity(taskId: string): Promise<ActivityEntry[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .eq("entity_type", "task")
    .eq("entity_id", taskId)
    .order("created_at", { ascending: false })
    .limit(50);
  fail(error);
  return (data as ActivityEntry[]) ?? [];
}

export async function listProjectActivity(projectId: string, limit = 20): Promise<ActivityEntry[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  fail(error);
  return (data as ActivityEntry[]) ?? [];
}
