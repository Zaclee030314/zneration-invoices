"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { ProjectStage, ProjectWithClient } from "@/lib/types";
import { PIPELINE_STAGES, STAGE_COLOR, STAGE_LABEL } from "@/lib/labels";
import { listProjects, moveProject } from "@/lib/queries/projects";
import { Board, type BoardColumn, type BoardItem } from "@/components/board/Board";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectDialog } from "@/components/projects/ProjectDialog";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/components/projects/format";
import { cn } from "@/lib/utils";

const COLUMNS: BoardColumn[] = PIPELINE_STAGES.map((s) => ({ id: s, label: STAGE_LABEL[s], color: STAGE_COLOR[s] }));

export default function PipelinePage() {
  const [projects, setProjects] = useState<ProjectWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const items = useMemo<BoardItem[]>(() => projects.map((p) => ({ id: p.id, columnId: p.stage, position: p.stage_position })), [projects]);

  const renderCard = useCallback(
    (id: string) => {
      const p = byId.get(id);
      return p ? <ProjectCard project={p} /> : null;
    },
    [byId]
  );

  const onMove = useCallback(
    async (id: string, toColumnId: string, position: number) => {
      const stage = toColumnId as ProjectStage;
      try {
        await moveProject(id, stage, position);
        setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, stage, stage_position: position } : p)));
      } catch (e) {
        toast.error((e as Error).message);
        load();
        throw e;
      }
    },
    [load]
  );

  const renderHeader = useCallback(
    (col: BoardColumn, ids: string[]) => {
      const total = ids.reduce((sum, id) => sum + Number(byId.get(id)?.contract_value ?? 0), 0);
      return (
        <>
          <span className={cn("text-xs font-medium px-2 py-0.5 rounded", col.color)}>{col.label}</span>
          <span className="text-xs text-neutral-500 text-right leading-tight">
            {ids.length}
            {total > 0 && <span className="block text-[10px] text-neutral-400">{formatMoney(total)}</span>}
          </span>
        </>
      );
    },
    [byId]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline</h1>
          <p className="text-xs text-neutral-500">Drag projects between stages. Archived projects are hidden.</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> New project
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : (
        <Board columns={COLUMNS} items={items} renderCard={renderCard} onMove={onMove} renderColumnHeader={renderHeader} emptyLabel="No projects" />
      )}
      <ProjectDialog open={creating} onOpenChange={setCreating} project={null} onSaved={() => load()} />
    </div>
  );
}
