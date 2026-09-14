"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { OPEN_STAGES, PRIORITY_DOT, STAGE_COLOR, STAGE_LABEL, formatDate, todayIso } from "@/lib/labels";
import { useWorkspace } from "@/lib/workspace";
import { loadDashboard, type DashboardData } from "@/lib/queries/dashboard";
import { ActivityList } from "@/components/projects/ActivityList";
import { OverdueInvoicesCard } from "@/components/finance/OverdueInvoicesCard";
import { HoursThisWeekCard } from "@/components/time/HoursThisWeekCard";
import { cn } from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { userId, profile, loading: wsLoading } = useWorkspace();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      if (!wsLoading) setLoading(false);
      return;
    }
    loadDashboard(userId)
      .then(setData)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [userId, wsLoading]);

  const firstName = (profile?.full_name || profile?.email || "").split(/[\s@]/)[0];
  const today = todayIso();
  const busy = loading || wsLoading;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-neutral-500">{new Date().toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="My tasks" className="lg:row-span-2" action={<span className="text-xs text-neutral-400">next 7 days</span>}>
          {busy ? (
            <Muted>Loading...</Muted>
          ) : !data || data.myTasks.length === 0 ? (
            <Muted>Nothing assigned to you that is due soon.</Muted>
          ) : (
            <ul className="divide-y -mx-1">
              {data.myTasks.map((t) => {
                const overdue = !!t.due_date && t.due_date < today;
                return (
                  <li key={t.id}>
                    <Link href={`/projects/${t.project_id}/tasks`} className="flex items-start gap-2 px-1 py-2 text-sm hover:bg-neutral-50 rounded">
                      <span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", PRIORITY_DOT[t.priority])} />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{t.title}</span>
                        <span className="block text-xs text-neutral-500 truncate">{t.projects ? `${t.projects.code} · ${t.projects.name}` : ""}</span>
                      </span>
                      <span className={cn("text-xs whitespace-nowrap", overdue ? "text-red-600 font-medium" : "text-neutral-500")}>
                        {t.due_date ? formatDate(t.due_date) : "No date"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Projects by stage" className="lg:col-span-2" action={<Link href="/pipeline" className="text-xs text-neutral-500 hover:underline">Pipeline</Link>}>
          {busy ? (
            <Muted>Loading...</Muted>
          ) : (
            <div className="grid grid-cols-5 gap-2">
              {OPEN_STAGES.map((s) => (
                <Link key={s} href="/pipeline" className="rounded border p-2 hover:bg-neutral-50 text-center">
                  <p className="text-lg font-semibold leading-none">{data?.stageCounts[s] ?? 0}</p>
                  <p className={cn("mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded", STAGE_COLOR[s])}>{STAGE_LABEL[s]}</p>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <OverdueInvoicesCard />
        <HoursThisWeekCard />

        <Card title="Recent activity" className="lg:col-span-3">
          <ActivityList
            entries={data?.activity ?? []}
            loading={busy}
            projectLabel={(e) => (e.project_id ? data?.projectsById[e.project_id]?.code ?? null : null)}
          />
        </Card>
      </div>
    </div>
  );
}

function Card({ title, action, className, children }: { title: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("bg-white border rounded p-4", className)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{title}</p>
        {action}
      </div>
      {children}
    </section>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-500">{children}</p>;
}
