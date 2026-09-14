import { supabase } from "@/lib/supabase/client";
import type { ActivityEntry, ProjectStage, Task } from "@/lib/types";
import { OPEN_STAGES, todayIso } from "@/lib/labels";

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

export type ProjectRef = { id: string; code: string; name: string };
export type MyTask = Task & { projects: ProjectRef | null };

export interface DashboardData {
  myTasks: MyTask[];
  stageCounts: Record<ProjectStage, number>;
  activity: ActivityEntry[];
  projectsById: Record<string, ProjectRef>;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// My open tasks due within 7 days, overdue, or undated; sorted by due date
// (undated last).
async function loadMyTasks(userId: string): Promise<MyTask[]> {
  const horizon = addDays(todayIso(), 7);
  const { data, error } = await supabase
    .from("tasks")
    .select("*, projects(id, code, name)")
    .eq("assignee_id", userId)
    .neq("status", "done")
    .or(`due_date.is.null,due_date.lte.${horizon}`)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(30);
  fail(error);
  return ((data ?? []) as unknown as MyTask[]).map((t) => ({
    ...t,
    projects: Array.isArray(t.projects) ? (t.projects[0] as ProjectRef) ?? null : t.projects,
  }));
}

async function loadProjects(): Promise<{ stageCounts: Record<ProjectStage, number>; projectsById: Record<string, ProjectRef> }> {
  const { data, error } = await supabase.from("projects").select("id, code, name, stage").is("archived_at", null);
  fail(error);
  const stageCounts = Object.fromEntries(OPEN_STAGES.map((s) => [s, 0])) as Record<ProjectStage, number>;
  const projectsById: Record<string, ProjectRef> = {};
  for (const p of (data ?? []) as (ProjectRef & { stage: ProjectStage })[]) {
    projectsById[p.id] = { id: p.id, code: p.code, name: p.name };
    if (p.stage in stageCounts) stageCounts[p.stage] += 1;
  }
  return { stageCounts, projectsById };
}

async function loadActivity(limit = 15): Promise<ActivityEntry[]> {
  const { data, error } = await supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(limit);
  fail(error);
  return (data as ActivityEntry[]) ?? [];
}

export async function loadDashboard(userId: string): Promise<DashboardData> {
  const [myTasks, projects, activity] = await Promise.all([loadMyTasks(userId), loadProjects(), loadActivity()]);
  return { myTasks, activity, ...projects };
}
