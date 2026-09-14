"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ExternalLink, Pencil } from "lucide-react";
import type { ProjectHealth, ProjectStage } from "@/lib/types";
import { HEALTHS, HEALTH_COLOR, KIND_LABEL, PRIORITY_COLOR, PRIORITY_LABEL, PROJECT_STAGES, STAGE_COLOR, formatDate } from "@/lib/labels";
import { memberName, useWorkspace } from "@/lib/workspace";
import { useProject } from "@/lib/project-context";
import { archiveProject, updateProject } from "@/lib/queries/projects";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ProjectDialog } from "./ProjectDialog";
import { formatMoney } from "./format";
import { cn } from "@/lib/utils";

export function ProjectHeader() {
  const { project, refresh } = useProject();
  const { members } = useWorkspace();
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  if (!project) return null;
  const lead = members.find((m) => m.user_id === project.lead_user_id);

  async function setStage(stage: ProjectStage) {
    if (!project) return;
    try {
      await updateProject(project.id, { stage });
      toast.success(`Stage set to ${PROJECT_STAGES.find((s) => s.value === stage)?.label}`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function setHealth(health: ProjectHealth) {
    if (!project) return;
    try {
      await updateProject(project.id, { health });
      toast.success(`Health set to ${HEALTHS.find((h) => h.value === health)?.label}`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function toggleArchive() {
    if (!project) return;
    const archiving = !project.archived_at;
    if (archiving && !confirm(`Archive project ${project.code}? It will be hidden from lists and the pipeline.`)) return;
    try {
      await archiveProject(project.id, archiving);
      toast.success(archiving ? "Project archived" : "Project restored");
      if (archiving) router.push("/projects");
      else await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Link href="/projects" className="hover:underline">Projects</Link>
            <span>/</span>
            <span className="font-mono">{project.code}</span>
            {project.archived_at && <span className="px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700">Archived</span>}
          </div>
          <h1 className="text-2xl font-semibold leading-tight truncate">{project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-600">
            {project.clients ? (
              <Link href={`/clients/${project.clients.id}`} className="hover:underline font-medium text-neutral-800">
                {project.clients.name}
              </Link>
            ) : (
              <span className="text-neutral-400">No client</span>
            )}
            <span>{KIND_LABEL[project.kind]}</span>
            <span className={cn("px-2 py-0.5 rounded text-xs font-medium", PRIORITY_COLOR[project.priority])}>{PRIORITY_LABEL[project.priority]}</span>
            <span>Lead: {lead ? memberName(lead) : <span className="text-neutral-400">none</span>}</span>
            {project.contract_value != null && <span className="font-medium text-neutral-800">{formatMoney(project.contract_value, project.currency)}</span>}
            {project.due_date && <span>Due {formatDate(project.due_date)}</span>}
            {project.url && (
              <a href={project.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                <ExternalLink className="h-3 w-3" /> Link
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={project.stage} onValueChange={(v) => setStage(v as ProjectStage)}>
            <SelectTrigger className={cn("h-8 w-32 text-xs font-medium border-0", STAGE_COLOR[project.stage])}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={project.health} onValueChange={(v) => setHealth(v as ProjectHealth)}>
            <SelectTrigger className={cn("h-8 w-32 text-xs font-medium border-0", HEALTH_COLOR[project.health])}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HEALTHS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleArchive} title={project.archived_at ? "Restore" : "Archive"}>
            {project.archived_at ? <ArchiveRestore /> : <Archive />}
          </Button>
        </div>
      </div>
      <ProjectDialog open={editing} onOpenChange={setEditing} project={project} onSaved={() => refresh()} />
    </div>
  );
}
