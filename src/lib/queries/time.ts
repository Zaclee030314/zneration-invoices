import { supabase } from "@/lib/supabase/client";
import type { Project, Task, TimeEntry } from "@/lib/types";

// Time-entry helpers. Every function throws on a Supabase error so callers
// can try/catch and toast. Inserts never set workspace_id or user_id: the DB
// defaults (default_workspace_id(), auth.uid()) fill them in.

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

export type ProjectRef = Pick<Project, "id" | "name" | "code">;
export type TaskRef = Pick<Task, "id" | "title">;

export interface TimeEntryWithRefs extends TimeEntry {
  projects: ProjectRef | null;
  tasks: TaskRef | null;
}

const ENTRY_SELECT = "*, projects(id, name, code), tasks(id, title)";

// PostgREST returns a single object for FK joins, but be defensive in case the
// relationship is inferred as one-to-many.
function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function normalise(row: unknown): TimeEntryWithRefs {
  const r = row as TimeEntry & { projects: ProjectRef | ProjectRef[] | null; tasks: TaskRef | TaskRef[] | null };
  return { ...r, projects: one(r.projects), tasks: one(r.tasks) };
}

export interface ListTimeParams {
  from: Date; // inclusive
  to: Date; // exclusive
  userId?: string | null;
  projectId?: string | null;
}

export async function listTimeEntries(params: ListTimeParams): Promise<TimeEntryWithRefs[]> {
  let q = supabase
    .from("time_entries")
    .select(ENTRY_SELECT)
    .gte("started_at", params.from.toISOString())
    .lt("started_at", params.to.toISOString())
    .order("started_at", { ascending: true });
  if (params.userId) q = q.eq("user_id", params.userId);
  if (params.projectId) q = q.eq("project_id", params.projectId);
  const { data, error } = await q;
  fail(error);
  return (data ?? []).map(normalise);
}

export async function getRunningEntry(userId: string): Promise<TimeEntryWithRefs | null> {
  const { data, error } = await supabase
    .from("time_entries")
    .select(ENTRY_SELECT)
    .eq("user_id", userId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  fail(error);
  return data ? normalise(data) : null;
}

// Stops whatever the user has running (the partial unique index allows only
// one open entry per user) and then opens a new one.
export async function startTimer(userId: string, projectId: string, taskId?: string | null): Promise<TimeEntryWithRefs> {
  const now = new Date().toISOString();
  const { error: stopErr } = await supabase.from("time_entries").update({ ended_at: now }).eq("user_id", userId).is("ended_at", null);
  fail(stopErr);
  const { data, error } = await supabase
    .from("time_entries")
    .insert({ project_id: projectId, task_id: taskId ?? null, started_at: now })
    .select(ENTRY_SELECT)
    .single();
  fail(error);
  return normalise(data);
}

export async function stopTimer(id: string): Promise<TimeEntryWithRefs> {
  const { data, error } = await supabase
    .from("time_entries")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", id)
    .select(ENTRY_SELECT)
    .single();
  fail(error);
  return normalise(data);
}

export interface TimeEntryInput {
  project_id: string;
  task_id: string | null;
  started_at: string;
  ended_at: string;
  note: string | null;
  billable: boolean;
}

export async function createTimeEntry(input: TimeEntryInput): Promise<TimeEntryWithRefs> {
  const { data, error } = await supabase.from("time_entries").insert(input).select(ENTRY_SELECT).single();
  fail(error);
  return normalise(data);
}

export async function updateTimeEntry(id: string, patch: Partial<TimeEntryInput>): Promise<TimeEntryWithRefs> {
  const { data, error } = await supabase.from("time_entries").update(patch).eq("id", id).select(ENTRY_SELECT).single();
  fail(error);
  return normalise(data);
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const { error } = await supabase.from("time_entries").delete().eq("id", id);
  fail(error);
}

// Open tasks for the task dropdown in the log dialog.
export async function listOpenTasks(projectId: string): Promise<TaskRef[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("project_id", projectId)
    .neq("status", "done")
    .order("position")
    .order("created_at");
  fail(error);
  return (data as TaskRef[]) ?? [];
}

// Minutes an entry represents right now: stored duration for finished entries,
// live elapsed for a running one.
export function entryMinutes(e: Pick<TimeEntry, "started_at" | "ended_at" | "duration_min">, now: number = Date.now()): number {
  if (e.ended_at) return e.duration_min ?? Math.max(0, Math.round((new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 60000));
  return Math.max(0, Math.floor((now - new Date(e.started_at).getTime()) / 60000));
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}
