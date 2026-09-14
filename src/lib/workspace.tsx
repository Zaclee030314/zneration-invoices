"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { Profile, Workspace, WorkspaceRole } from "@/lib/types";

export interface Member {
  user_id: string;
  role: WorkspaceRole;
  profile: Profile | null;
}

interface WorkspaceContextValue {
  loading: boolean;
  userId: string | null;
  workspaceId: string | null;
  workspace: Workspace | null;
  role: WorkspaceRole | null;
  isAdmin: boolean;
  profile: Profile | null;
  members: Member[];
  refreshMembers: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  loading: true,
  userId: null,
  workspaceId: null,
  workspace: null,
  role: null,
  isAdmin: false,
  profile: null,
  members: [],
  refreshMembers: async () => {},
});

// Resolves the signed-in user's workspace (first membership) and the member
// roster. Every table is scoped by workspace_id through RLS, so the app only
// needs this to know who the user is and who can be assigned work.
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [role, setRole] = useState<WorkspaceRole | null>(null);
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

      const { data: membership, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, role, workspaces(*)")
        .eq("user_id", user.id)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (cancelled) return;

      if (error) {
        // Table missing (migration not applied yet) or network error: keep the
        // app usable rather than locking the user out.
        console.error("workspace lookup failed", error.message);
        setLoading(false);
        return;
      }
      if (!membership) {
        setLoading(false);
        router.replace("/no-access");
        return;
      }
      const ws = (Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces) as Workspace | null;
      setWorkspace(ws);
      setRole(membership.role as WorkspaceRole);

      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (!cancelled) setProfile((prof as Profile) ?? { id: user.id, email: user.email ?? "", full_name: null, avatar_url: null, created_at: "" });
      if (ws) await loadMembers(ws.id);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, loadMembers]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      loading,
      userId,
      workspaceId: workspace?.id ?? null,
      workspace,
      role,
      isAdmin: role === "admin",
      profile,
      members,
      refreshMembers: async () => {
        if (workspace) await loadMembers(workspace.id);
      },
    }),
    [loading, userId, workspace, role, profile, members, loadMembers]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

export function memberName(m: Member | undefined | null): string {
  if (!m) return "Unassigned";
  return m.profile?.full_name || m.profile?.email || "Member";
}
