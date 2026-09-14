"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import type { Milestone, MilestoneStatus } from "@/lib/types";
import { MILESTONE_STATUSES, MILESTONE_STATUS_COLOR, formatDate, todayIso } from "@/lib/labels";
import { useProject } from "@/lib/project-context";
import { createMilestone, deleteMilestone, reorderMilestones, taskCountsByMilestone, updateMilestone, type MilestoneInput } from "@/lib/queries/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Draft = { title: string; description: string; due_date: string; status: MilestoneStatus };
const EMPTY: Draft = { title: "", description: "", due_date: "", status: "planned" };

export default function MilestonesPage() {
  const { project, milestones, refresh } = useProject();
  const [counts, setCounts] = useState<Record<string, { total: number; done: number }>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const projectId = project?.id;
  useEffect(() => {
    if (!projectId) return;
    taskCountsByMilestone(projectId).then(setCounts).catch((e: Error) => toast.error(e.message));
  }, [projectId, milestones]);

  if (!project) return null;

  async function run(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success);
      await refresh();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const ids = milestones.map((m) => m.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await run(() => reorderMilestones(ids));
  }

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {milestones.filter((m) => m.status === "done").length}/{milestones.length} done
        </p>
        <Button size="sm" onClick={() => setAdding(true)} disabled={adding}>
          <Plus /> Add milestone
        </Button>
      </div>

      {milestones.length === 0 && !adding && (
        <div className="bg-white border rounded p-8 text-center text-sm text-neutral-500">No milestones yet. Break the project into phases with dated milestones.</div>
      )}

      <ol className="space-y-2">
        {milestones.map((m, i) =>
          editingId === m.id ? (
            <li key={m.id}>
              <MilestoneForm
                initial={{ title: m.title, description: m.description ?? "", due_date: m.due_date ?? "", status: m.status }}
                busy={busy}
                onCancel={() => setEditingId(null)}
                onSave={async (d) => {
                  if (await run(() => updateMilestone(m.id, d), "Milestone updated")) setEditingId(null);
                }}
              />
            </li>
          ) : (
            <li key={m.id} className="bg-white border rounded p-3 flex items-start gap-3">
              <Checkbox
                className="mt-1"
                checked={m.status === "done"}
                onCheckedChange={(v) => run(() => updateMilestone(m.id, { status: v ? "done" : "planned" }))}
                disabled={busy}
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("font-medium text-sm", m.status === "done" && "line-through text-neutral-400")}>{m.title}</span>
                  <Select value={m.status} onValueChange={(v) => run(() => updateMilestone(m.id, { status: v as MilestoneStatus }))}>
                    <SelectTrigger className={cn("h-6 w-32 text-[11px] border-0 shadow-none", MILESTONE_STATUS_COLOR[m.status])}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MILESTONE_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-neutral-500">
                  {m.due_date && (
                    <span className={cn(m.status !== "done" && m.due_date < todayIso() && "text-red-600 font-medium")}>Due {formatDate(m.due_date)}</span>
                  )}
                  <span>
                    {counts[m.id] ? `${counts[m.id].done}/${counts[m.id].total} tasks done` : "No tasks"}
                  </span>
                  {m.completed_at && <span>Completed {formatDate(m.completed_at)}</span>}
                </div>
                {m.description && <p className="mt-1 text-sm text-neutral-600 whitespace-pre-wrap">{m.description}</p>}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <IconBtn title="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn title="Move down" disabled={busy || i === milestones.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn title="Edit" disabled={busy} onClick={() => setEditingId(m.id)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                <IconBtn
                  title="Delete"
                  disabled={busy}
                  className="hover:text-red-600"
                  onClick={() => {
                    if (confirm(`Delete milestone "${m.title}"? Tasks keep their data but lose the link.`)) run(() => deleteMilestone(m.id), "Milestone deleted");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            </li>
          )
        )}
        {adding && (
          <li>
            <MilestoneForm
              initial={EMPTY}
              busy={busy}
              onCancel={() => setAdding(false)}
              onSave={async (d) => {
                const next = (milestones[milestones.length - 1]?.sort_order ?? -1) + 1;
                if (await run(() => createMilestone(project.id, d, next), "Milestone added")) setAdding(false);
              }}
            />
          </li>
        )}
      </ol>
    </div>
  );
}

function MilestoneForm({ initial, busy, onSave, onCancel }: { initial: Draft; busy: boolean; onSave: (d: MilestoneInput) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  return (
    <form
      className="bg-white border rounded p-3 space-y-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!d.title.trim()) return toast.error("Title is required");
        onSave({ title: d.title, description: d.description, due_date: d.due_date, status: d.status });
      }}
    >
      <div className="grid grid-cols-[1fr_150px_150px] gap-2">
        <Input placeholder="Milestone title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} autoFocus required />
        <Input type="date" value={d.due_date} onChange={(e) => setD({ ...d, due_date: e.target.value })} />
        <Select value={d.status} onValueChange={(v) => setD({ ...d, status: v as MilestoneStatus })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MILESTONE_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Textarea rows={2} placeholder="Description (optional)" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={busy}>Save</Button>
      </div>
    </form>
  );
}

function IconBtn({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} className={cn("p-1.5 rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 disabled:pointer-events-none", className)}>
      {children}
    </button>
  );
}
