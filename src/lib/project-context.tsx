"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Milestone, ProjectWithClient } from "@/lib/types";

interface ProjectContextValue {
  project: ProjectWithClient | null;
  milestones: Milestone[];
  loading: boolean;
  notFound: boolean;
  refresh: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue>({
  project: null,
  milestones: [],
  loading: true,
  notFound: false,
  refresh: async () => {},
});

// Loads one project (+ client name + milestones) for the /projects/[id] tree.
// Tab pages read it with useProject() instead of fetching again.
export function ProjectProvider({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  const [project, setProject] = useState<ProjectWithClient | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    const [{ data: p }, { data: ms }] = await Promise.all([
      supabase.from("projects").select("*, clients(id, name)").eq("id", projectId).maybeSingle(),
      supabase.from("milestones").select("*").eq("project_id", projectId).order("sort_order").order("created_at"),
    ]);
    setProject((p as ProjectWithClient | null) ?? null);
    setNotFound(!p);
    setMilestones((ms as Milestone[]) ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ project, milestones, loading, notFound, refresh }), [project, milestones, loading, notFound, refresh]);
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  return useContext(ProjectContext);
}
