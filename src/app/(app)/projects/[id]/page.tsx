"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { ActivityEntry } from "@/lib/types";
import { TASK_STATUSES, formatDate } from "@/lib/labels";
import { useProject } from "@/lib/project-context";
import { taskStatusCounts } from "@/lib/queries/projects";
import { listProjectActivity } from "@/lib/queries/tasks";
import { ActivityList } from "@/components/projects/ActivityList";
import { NotesPanel } from "@/components/crm/NotesPanel";
import { cn } from "@/lib/utils";

export default function ProjectOverviewPage() {
  const { project, milestones } = useProject();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const projectId = project?.id;
  useEffect(() => {
    if (!projectId) return;
    Promise.all([taskStatusCounts(projectId), listProjectActivity(projectId, 20)])
      .then(([c, a]) => {
        setCounts(c);
        setActivity(a);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (!project) return null;

  const totalTasks = Object.values(counts).reduce((a, b) => a + b, 0);
  const doneMilestones = milestones.filter((m) => m.status === "done").length;
  const pct = milestones.length ? Math.round((doneMilestones / milestones.length) * 100) : 0;
  const nextMilestone = milestones.find((m) => m.status !== "done");

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <section className="bg-white border rounded p-4">
          <h2 className="text-sm font-medium mb-2">Description</h2>
          {project.description ? (
            <p className="text-sm whitespace-pre-wrap text-neutral-700">{project.description}</p>
          ) : (
            <p className="text-sm text-neutral-400">No description yet. Use Edit to add one.</p>
          )}
        </section>

        <section className="bg-white border rounded p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium">Tasks</h2>
            <Link href={`/projects/${project.id}/tasks`} className="text-xs text-neutral-500 hover:underline">
              Open board
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-neutral-500">Loading...</p>
          ) : totalTasks === 0 ? (
            <p className="text-sm text-neutral-400">No tasks yet.</p>
          ) : (
            <div className="grid grid-cols-5 gap-2">
              {TASK_STATUSES.map((s) => (
                <Link key={s.value} href={`/projects/${project.id}/tasks?view=list`} className="rounded border p-2 hover:bg-neutral-50">
                  <p className="text-lg font-semibold leading-none">{counts[s.value] ?? 0}</p>
                  <p className={cn("mt-1 inline-block text-[11px] px-1.5 py-0.5 rounded", s.color)}>{s.label}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border rounded p-4">
          <h2 className="text-sm font-medium mb-2">Recent activity</h2>
          <ActivityList entries={activity} loading={loading} />
        </section>
      </div>

      <div className="space-y-4">
        <section className="bg-white border rounded p-4 text-sm">
          <h2 className="text-sm font-medium mb-2">Key dates</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-neutral-700">
            <dt className="text-neutral-500">Start</dt>
            <dd>{formatDate(project.start_date) || <span className="text-neutral-400">–</span>}</dd>
            <dt className="text-neutral-500">Due</dt>
            <dd>{formatDate(project.due_date) || <span className="text-neutral-400">–</span>}</dd>
            <dt className="text-neutral-500">Next milestone</dt>
            <dd>
              {nextMilestone ? (
                <>
                  {nextMilestone.title}
                  {nextMilestone.due_date && <span className="text-neutral-500"> · {formatDate(nextMilestone.due_date)}</span>}
                </>
              ) : (
                <span className="text-neutral-400">–</span>
              )}
            </dd>
            <dt className="text-neutral-500">Created</dt>
            <dd>{formatDate(project.created_at)}</dd>
          </dl>
        </section>

        <section className="bg-white border rounded p-4 text-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium">Milestones</h2>
            <Link href={`/projects/${project.id}/milestones`} className="text-xs text-neutral-500 hover:underline">
              Manage
            </Link>
          </div>
          {milestones.length === 0 ? (
            <p className="text-neutral-400">No milestones yet.</p>
          ) : (
            <>
              <p className="text-neutral-600 mb-1.5">
                {doneMilestones}/{milestones.length} done · {pct}%
              </p>
              <div className="h-2 rounded bg-neutral-100 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <ul className="mt-3 space-y-1">
                {milestones.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span className={cn("truncate", m.status === "done" && "line-through text-neutral-400")}>{m.title}</span>
                    <span className="text-xs text-neutral-500 whitespace-nowrap">{formatDate(m.due_date)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <NotesPanel projectId={project.id} />
      </div>
    </div>
  );
}
