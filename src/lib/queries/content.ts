import { supabase } from "@/lib/supabase/client";
import type { ContentChannel, ContentItem, ContentStatus, Project } from "@/lib/types";

// Content-calendar helpers. Throw on Supabase errors; inserts rely on the DB
// defaults for workspace_id and created_by.

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

export type ContentProjectRef = Pick<Project, "id" | "name" | "code">;

export interface ContentItemWithRefs extends ContentItem {
  projects: ContentProjectRef | null;
}

const CONTENT_SELECT = "*, projects(id, name, code)";

function normalise(row: unknown): ContentItemWithRefs {
  const r = row as ContentItem & { projects: ContentProjectRef | ContentProjectRef[] | null };
  const p = r.projects;
  return { ...r, projects: Array.isArray(p) ? p[0] ?? null : p ?? null };
}

export interface ListContentParams {
  from: string; // yyyy-mm-dd inclusive
  to: string; // yyyy-mm-dd inclusive
  projectId?: string | null;
  channel?: ContentChannel | null;
  status?: ContentStatus | null;
  assigneeId?: string | null;
}

export async function listContent(params: ListContentParams): Promise<ContentItemWithRefs[]> {
  let q = supabase
    .from("content_items")
    .select(CONTENT_SELECT)
    .gte("due_date", params.from)
    .lte("due_date", params.to)
    .order("due_date")
    .order("publish_at", { ascending: true, nullsFirst: false })
    .order("created_at");
  if (params.projectId) q = q.eq("project_id", params.projectId);
  if (params.channel) q = q.eq("channel", params.channel);
  if (params.status) q = q.eq("status", params.status);
  if (params.assigneeId) q = q.eq("assignee_id", params.assigneeId);
  const { data, error } = await q;
  fail(error);
  return (data ?? []).map(normalise);
}

export type ContentInput = Omit<ContentItem, "id" | "workspace_id" | "created_by" | "created_at" | "updated_at">;

function clean(input: ContentInput) {
  return {
    project_id: input.project_id ?? null,
    client_id: input.client_id ?? null,
    task_id: input.task_id ?? null,
    title: input.title.trim(),
    channel: input.channel,
    format: input.format,
    status: input.status,
    due_date: input.due_date,
    publish_at: input.publish_at ?? null,
    assignee_id: input.assignee_id ?? null,
    caption: input.caption?.trim() || null,
    asset_url: input.asset_url?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

export async function createContent(input: ContentInput): Promise<ContentItemWithRefs> {
  const { data, error } = await supabase.from("content_items").insert(clean(input)).select(CONTENT_SELECT).single();
  fail(error);
  return normalise(data);
}

export async function updateContent(id: string, patch: Partial<ContentInput>): Promise<ContentItemWithRefs> {
  const { data, error } = await supabase.from("content_items").update(patch).eq("id", id).select(CONTENT_SELECT).single();
  fail(error);
  return normalise(data);
}

export async function saveContent(id: string, input: ContentInput): Promise<ContentItemWithRefs> {
  return updateContent(id, clean(input));
}

export async function deleteContent(id: string): Promise<void> {
  const { error } = await supabase.from("content_items").delete().eq("id", id);
  fail(error);
}
