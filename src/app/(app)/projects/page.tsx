"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import type { ProjectKind, ProjectStage, ProjectWithClient } from "@/lib/types";
import { HEALTH_COLOR, HEALTH_LABEL, KIND_LABEL, OPEN_STAGES, PROJECT_KINDS, PROJECT_STAGES, STAGE_COLOR, STAGE_LABEL, formatDate, todayIso } from "@/lib/labels";
import { memberName, useWorkspace } from "@/lib/workspace";
import { listProjects, openTaskCountsByProject } from "@/lib/queries/projects";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectDialog } from "@/components/projects/ProjectDialog";
import { cn } from "@/lib/utils";

type StageFilter = "open" | "all" | ProjectStage;

export default function ProjectsPage() {
  const { members } = useWorkspace();
  const [projects, setProjects] = useState<ProjectWithClient[]>([]);
  const [openCounts, setOpenCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<StageFilter>("open");
  const [kind, setKind] = useState<ProjectKind | "all">("all");
  const [clientId, setClientId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([listProjects(), openTaskCountsByProject()]);
      setProjects(p);
      setOpenCounts(c);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) if (p.clients) m.set(p.clients.id, p.clients.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [projects]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects
      .filter((p) => (stage === "all" ? true : stage === "open" ? OPEN_STAGES.includes(p.stage) : p.stage === stage))
      .filter((p) => kind === "all" || p.kind === kind)
      .filter((p) => clientId === "all" || p.client_id === clientId)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.clients?.name ?? "").toLowerCase().includes(q))
      .sort((a, b) => PROJECT_STAGES.findIndex((s) => s.value === a.stage) - PROJECT_STAGES.findIndex((s) => s.value === b.stage) || a.name.localeCompare(b.name));
  }, [projects, stage, kind, clientId, search]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const today = todayIso();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> New project
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white border rounded p-3">
        <Select value={stage} onValueChange={(v) => setStage(v as StageFilter)}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open stages</SelectItem>
            <SelectItem value="all">All stages</SelectItem>
            {PROJECT_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(v) => setKind(v as ProjectKind | "all")}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {PROJECT_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-neutral-400" />
          <input className="h-8 w-56 border rounded-md pl-7 pr-2 text-xs" placeholder="Search code, name, client" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="ml-auto text-xs text-neutral-500">{rows.length} of {projects.length}</span>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-500">{projects.length === 0 ? "No projects yet. Create the first one." : "No projects match these filters."}</p>
      ) : (
        <div className="bg-white border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b text-left text-xs text-neutral-500">
              <tr>
                <th className="p-2 font-medium">Code</th>
                <th className="p-2 font-medium">Name</th>
                <th className="p-2 font-medium">Client</th>
                <th className="p-2 font-medium">Kind</th>
                <th className="p-2 font-medium">Stage</th>
                <th className="p-2 font-medium">Health</th>
                <th className="p-2 font-medium">Lead</th>
                <th className="p-2 font-medium">Due</th>
                <th className="p-2 font-medium text-right">Open tasks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const overdue = !!p.due_date && p.due_date < today && OPEN_STAGES.includes(p.stage);
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-neutral-50">
                    <td className="p-2 font-mono text-xs"><Link href={`/projects/${p.id}`} className="hover:underline">{p.code}</Link></td>
                    <td className="p-2 font-medium"><Link href={`/projects/${p.id}`} className="hover:underline">{p.name}</Link></td>
                    <td className="p-2">
                      {p.clients ? <Link href={`/clients/${p.clients.id}`} className="hover:underline">{p.clients.name}</Link> : <span className="text-neutral-400">–</span>}
                    </td>
                    <td className="p-2 text-neutral-600">{KIND_LABEL[p.kind]}</td>
                    <td className="p-2"><span className={cn("text-xs px-2 py-0.5 rounded font-medium", STAGE_COLOR[p.stage])}>{STAGE_LABEL[p.stage]}</span></td>
                    <td className="p-2"><span className={cn("text-xs px-2 py-0.5 rounded font-medium", HEALTH_COLOR[p.health])}>{HEALTH_LABEL[p.health]}</span></td>
                    <td className="p-2 text-neutral-600">{p.lead_user_id ? memberName(memberById.get(p.lead_user_id)) : <span className="text-neutral-400">–</span>}</td>
                    <td className={cn("p-2 whitespace-nowrap", overdue ? "text-red-600 font-medium" : "text-neutral-600")}>{formatDate(p.due_date) || <span className="text-neutral-400">–</span>}</td>
                    <td className="p-2 text-right tabular-nums">{openCounts[p.id] ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProjectDialog open={creating} onOpenChange={setCreating} project={null} onSaved={() => load()} />
    </div>
  );
}
