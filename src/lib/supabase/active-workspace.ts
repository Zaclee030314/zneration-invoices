import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveProfile, type CompanyProfile } from "@/lib/company";

// The company the caller is working in (migration 011). Before that migration
// exists, their first membership, which is what RLS showed anyway.
export async function activeWorkspaceId(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await db.rpc("active_workspace_id");
  if (!error) return (data as string | null) ?? null;
  const { data: membership } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (membership?.workspace_id as string | undefined) ?? null;
}

// Letterhead and number series of the company that owns a document.
export async function companyProfileFor(db: SupabaseClient, workspaceId: string): Promise<CompanyProfile> {
  const { data, error } = await db.from("workspaces").select("*").eq("id", workspaceId).maybeSingle();
  if (error) throw new Error(error.message);
  return resolveProfile(data as { name?: string; profile?: unknown } | null);
}
