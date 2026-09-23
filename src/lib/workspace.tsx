"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { ZNERATION_PROFILE, resolveProfile, type CompanyProfile } from "@/lib/company";
import type { Profile, Workspace, WorkspaceRole } from "@/lib/types";

export interface Member {
  user_id: string;
  role: WorkspaceRole;
  profile: Profile | null;
}

// A company the signed-in user belongs to (row of the my_workspaces RPC).
export interface CompanyOption extends Workspace {
  role: WorkspaceRole;
  profile: unknown;
  is_active: boolean;
}

interface WorkspaceContextValue {
  loading: boolean;
  userId: string | null;
  workspaceId: string | null;
  workspace: Workspace | null;
  role: WorkspaceRole | null;
  isAdmin: boolean;
  profile: Profile | null;
  company: CompanyProfile;
  companies: CompanyOption[];
  members: Member[];
  refreshMembers: () => Promise<void>;
  refreshCompanies: () => Promise<void>;
  switchCompany: (workspaceId: string) => Promise<string | null>;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  loading: true,
  userId: null,
  workspaceId: null,
  workspace: null,
  role: null,
  isAdmin: false,
  profile: null,
  company: ZNERATION_PROFILE,
  companies: [],
  members: [],
  refreshMembers: async () => {},
  refreshCompanies: async () => {},
  switchCompany: async () => null,
});

type Loaded = { companies: CompanyOption[]; active: CompanyOption | null } | { error: string };

// Companies the user belongs to, active one first choice. Falls back to the
// first membership while migration 011 (my_workspaces) has not been run.
async function loadCompanies(userId: string): Promise<Loaded> {
  const { data, error } = await supabase.rpc("my_workspaces");
  if (!error) {
    const companies = (data ?? []) as CompanyOption[];
    return { companies, active: companies.find((c) => c.is_active) ?? companies[0] ?? null };
  }
  const { data: membership, error: memErr } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(*)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (memErr) return { error: memErr.message };
  if (!membership) return { companies: [], active: null };
  const ws = (Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces) as (Workspace & { profile?: unknown }) | null;
  if (!ws) return { companies: [], active: null };
  const only: CompanyOption = { ...ws, role: membership.role as WorkspaceRole, profile: ws.profile, is_active: true };
  return { companies: [only], active: only };
}

// Resolves the signed-in user's active company and its member roster. Every
// table is scoped to the active company through RLS, so the app only needs this
// to know who the user is, which letterhead to print and who can be assigned work.
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [active, setActive] = useState<CompanyOption | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const loadMembers = useCallback(async (wsId: string) => {
    const { data } = await supabase
      .from("workspace_members")
      .select("user_id, role, profiles(*)")
      .eq("workspace_id", wsId);
    const rows = (data ?? []) as unknown as { user_id: string; role: WorkspaceRole; profiles: Profile | Profile[] | null }[];
    setMembers(
      rows
        .map((r) => ({ user_id: r.user_id, role: r.role, profile: Array.isArray(r.profiles) ? r.profiles[0] ?? null : r.profiles }))
        .sort((a, b) => (a.profile?.full_name || a.profile?.email || "").localeCompare(b.profile?.full_name || b.profile?.email || ""))
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setUserId(user.id);

      const loaded = await loadCompanies(user.id);
      if (cancelled) return;
      if ("error" in loaded) {
        // Network error or tables missing: keep the app usable rather than locking the user out.
        console.error("workspace lookup failed", loaded.error);
        setLoading(false);
        return;
      }
      if (!loaded.active) {
        setLoading(false);
        router.replace("/no-access");
        return;
      }
      setCompanies(loaded.companies);
      setActive(loaded.active);

      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (!cancelled) setProfile((prof as Profile) ?? { id: user.id, email: user.email ?? "", full_name: null, avatar_url: null, created_at: "" });
      await loadMembers(loaded.active.id);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, loadMembers]);

  // Another tab may have switched company; this tab's data would then belong to
  // the other company, so reload when it comes back into view.
  useEffect(() => {
    if (!active) return;
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      const { data, error } = await supabase.rpc("active_workspace_id");
      if (!error && data && data !== active.id) window.location.reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [active]);

  const refreshCompanies = useCallback(async () => {
    if (!userId) return;
    const loaded = await loadCompanies(userId);
    if ("error" in loaded) return;
    setCompanies(loaded.companies);
    if (loaded.active) setActive(loaded.active);
  }, [userId]);

  // A full page load clears every list, form and cache that belonged to the old company.
  const switchCompany = useCallback(async (workspaceId: string) => {
    const { error } = await supabase.rpc("set_active_workspace", { p_workspace: workspaceId });
    if (error) return error.message;
    window.location.assign("/dashboard");
    return null;
  }, []);

  const value = useMemo<WorkspaceContextValue>(() => {
    const workspace: Workspace | null = active
      ? { id: active.id, name: active.name, slug: active.slug, created_by: active.created_by, created_at: active.created_at }
      : null;
    return {
      loading,
      userId,
      workspaceId: active?.id ?? null,
      workspace,
      role: active?.role ?? null,
      isAdmin: active?.role === "admin",
      profile,
      company: resolveProfile(active),
      companies,
      members,
      refreshMembers: async () => {
        if (active) await loadMembers(active.id);
      },
      refreshCompanies,
      switchCompany,
    };
  }, [loading, userId, active, profile, companies, members, loadMembers, refreshCompanies, switchCompany]);

  // Pages render only once the active company is known, so nothing is shown or
  // saved under the wrong company's letterhead or number series.
  return (
    <WorkspaceContext.Provider value={value}>
      {loading ? <p className="p-6 text-sm text-neutral-500">Loading...</p> : children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

export function memberName(m: Member | undefined | null): string {
  if (!m) return "Unassigned";
  return m.profile?.full_name || m.profile?.email || "Member";
}
