import { supabase } from "@/lib/supabase/client";
import type { Milestone, MilestoneStatus, Project, ProjectStage, ProjectWithClient } from "@/lib/types";

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

const PROJECT_SELECT = "*, clients(id, name)";

export async function listProjects(opts: { includeArchived?: boolean; clientId?: string } = {}): Promise<ProjectWithClient[]> {
  let q = supabase.from("projects").select(PROJECT_SELECT).order("updated_at", { ascending: false });
  if (!opts.includeArchived) q = q.is("archived_at", null);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data, error } = await q;
  fail(error);
  return (data as unknown as ProjectWithClient[]) ?? [];
}

export async function getProject(id: string): Promise<ProjectWithClient | null> {
  const { data, error } = await supabase.from("projects").select(PROJECT_SELECT).eq("id", id).maybeSingle();
  fail(error);
  return (data as unknown as ProjectWithClient | null) ?? null;
}

// { projectId: number of not-done tasks }, grouped client-side.
export async function openTaskCountsByProject(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("tasks").select("project_id").neq("status", "done");
  fail(error);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { project_id: string }[]) out[r.project_id] = (out[r.project_id] ?? 0) + 1;
  return out;
}

// { status: count } for one project's tasks.
export async function taskStatusCounts(projectId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("tasks").select("status").eq("project_id", projectId);
  fail(error);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { status: string }[]) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

// "HG Group Hub ERP" -> "HGGHE": first letter of each word, uppercased. Falls
// back to the first 3 letters of a single-word name.
export function suggestCode(name: string): string {
  const words = name
    .trim()
    .split(/[\s\-_/&]+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 8);
}

// Appends -2, -3, ... until the code is unused in this workspace.
export async function ensureUniqueCode(base: string, excludeId?: string): Promise<string> {
  const root = base.trim().toUpperCase();
  if (!root) return root;
  let q = supabase.from("projects").select("id, code").ilike("code", `${root}%`);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  fail(error);
  const taken = new Set(((data ?? []) as { code: string }[]).map((r) => r.code.toUpperCase()));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}

export type ProjectInput = {
  name: string;
  code: string;
  client_id?: string | null;
  kind?: Project["kind"];
  stage?: ProjectStage;
  priority?: Project["priority"];
  health?: Project["health"];
  contract_value?: number | null;
  currency?: string;
  start_date?: string | null;
  due_date?: string | null;
  lead_user_id?: string | null;
  url?: string | null;
  description?: string | null;
};

function cleanProject(input: Partial<ProjectInput>) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.code !== undefined) patch.code = input.code.trim().toUpperCase();
  if (input.client_id !== undefined) patch.client_id = input.client_id || null;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.stage !== undefined) patch.stage = input.stage;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.health !== undefined) patch.health = input.health;
  if (input.contract_value !== undefined) patch.contract_value = input.contract_value ?? null;
  if (input.currency !== undefined) patch.currency = input.currency || "MYR";
  if (input.start_date !== undefined) patch.start_date = input.start_date || null;
  if (input.due_date !== undefined) patch.due_date = input.due_date || null;
  if (input.lead_user_id !== undefined) patch.lead_user_id = input.lead_user_id || null;
  if (input.url !== undefined) patch.url = input.url?.trim() || null;
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  return patch;
}

export async function createProject(input: ProjectInput): Promise<ProjectWithClient> {
  // New cards go to the bottom of their pipeline column.
  const { data: last } = await supabase
    .from("projects")
    .select("stage_position")
    .eq("stage", input.stage ?? "lead")
    .order("stage_position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const stage_position = ((last as { stage_position: number } | null)?.stage_position ?? 0) + 1000;
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...cleanProject(input), stage_position })
    .select(PROJECT_SELECT)
    .single();
  fail(error);
  return data as unknown as ProjectWithClient;
}

export async function updateProject(id: string, input: Partial<ProjectInput>): Promise<ProjectWithClient> {
  const { data, error } = await supabase.from("projects").update(cleanProject(input)).eq("id", id).select(PROJECT_SELECT).single();
  fail(error);
  return data as unknown as ProjectWithClient;
}

export async function moveProject(id: string, stage: ProjectStage, stage_position: number): Promise<void> {
  const { error } = await supabase.from("projects").update({ stage, stage_position }).eq("id", id);
  fail(error);
}

export async function archiveProject(id: string, archived = true): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------
export type MilestoneInput = {
  title: string;
  description?: string | null;
  due_date?: string | null;
  status?: MilestoneStatus;
};

export async function listMilestones(projectId: string): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from("milestones")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order")
    .order("created_at");
  fail(error);
  return (data as Milestone[]) ?? [];
}

export async function createMilestone(projectId: string, input: MilestoneInput, sort_order: number): Promise<Milestone> {
  const { data, error } = await supabase
    .from("milestones")
    .insert({
      project_id: projectId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: input.due_date || null,
      status: input.status ?? "planned",
      sort_order,
    })
    .select("*")
    .single();
  fail(error);
  return data as Milestone;
}

export async function updateMilestone(id: string, input: Partial<MilestoneInput & { sort_order: number }>): Promise<Milestone> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.due_date !== undefined) patch.due_date = input.due_date || null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  const { data, error } = await supabase.from("milestones").update(patch).eq("id", id).select("*").single();
  fail(error);
  return data as Milestone;
}

export async function deleteMilestone(id: string): Promise<void> {
  const { error } = await supabase.from("milestones").delete().eq("id", id);
  fail(error);
}

// Writes sort_order = index for the given id order.
export async function reorderMilestones(ids: string[]): Promise<void> {
  const results = await Promise.all(ids.map((id, i) => supabase.from("milestones").update({ sort_order: i }).eq("id", id)));
  const bad = results.find((r) => r.error);
  if (bad?.error) throw new Error(bad.error.message);
}

// { milestoneId: { total, done } } for one project's tasks.
export async function taskCountsByMilestone(projectId: string): Promise<Record<string, { total: number; done: number }>> {
  const { data, error } = await supabase.from("tasks").select("milestone_id, status").eq("project_id", projectId);
  fail(error);
  const out: Record<string, { total: number; done: number }> = {};
  for (const r of (data ?? []) as { milestone_id: string | null; status: string }[]) {
    if (!r.milestone_id) continue;
    const c = (out[r.milestone_id] ??= { total: 0, done: 0 });
    c.total += 1;
    if (r.status === "done") c.done += 1;
  }
  return out;
}
