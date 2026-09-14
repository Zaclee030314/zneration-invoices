"use client";
import { ContentCalendar } from "@/components/calendar/ContentCalendar";
import { useProject } from "@/lib/project-context";

export default function ProjectContentPage() {
  const { project, loading, notFound } = useProject();
  if (loading) return <p className="text-sm text-neutral-400">Loading…</p>;
  if (notFound || !project) return <p className="text-sm text-neutral-500">Project not found.</p>;
  return <ContentCalendar key={project.id} projectId={project.id} clientId={project.client_id} defaultView="list" />;
}
