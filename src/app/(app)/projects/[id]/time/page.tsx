"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, parse, subDays } from "date-fns";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StartTimerButton } from "@/components/time/StartTimerButton";
import { TimeEntriesTable } from "@/components/time/TimeEntriesTable";
import { TimeLogDialog } from "@/components/time/TimeLogDialog";
import { useProject } from "@/lib/project-context";
import { useWorkspace, memberName } from "@/lib/workspace";
import { useTimer } from "@/lib/timer";
import { deleteTimeEntry, entryMinutes, listTimeEntries, type TimeEntryWithRefs } from "@/lib/queries/time";
import { formatMinutes } from "@/lib/labels";

const DAY = "yyyy-MM-dd";

export default function ProjectTimePage() {
  const { project, loading: projectLoading, notFound } = useProject();
  const { userId, isAdmin, members } = useWorkspace();
  const { running, elapsedSec, version } = useTimer();
  const [from, setFrom] = useState(format(subDays(new Date(), 30), DAY));
  const [to, setTo] = useState(format(new Date(), DAY));
  const [entries, setEntries] = useState<TimeEntryWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntryWithRefs | null>(null);

  const projectId = project?.id ?? null;

  const load = useCallback(async () => {
    if (!projectId) return;
    const fromDate = parse(from, DAY, new Date());
    const toDate = addDays(parse(to, DAY, new Date()), 1);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return;
    setLoading(true);
    try {
      setEntries(await listTimeEntries({ from: fromDate, to: toDate, projectId }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId, from, to]);

  useEffect(() => {
    load();
  }, [load, version]);

  const minutesOf = useCallback(
    (e: TimeEntryWithRefs) => (running && e.id === running.id ? Math.floor(elapsedSec / 60) : entryMinutes(e)),
    [running, elapsedSec]
  );

  const groups = useMemo(() => {
    const map = new Map<string, { entries: TimeEntryWithRefs[]; total: number; billable: number }>();
    for (const e of entries) {
      const g = map.get(e.user_id) ?? { entries: [], total: 0, billable: 0 };
      g.entries.push(e);
      const min = minutesOf(e);
      g.total += min;
      if (e.billable) g.billable += min;
      map.set(e.user_id, g);
    }
    return [...map.entries()]
      .map(([uid, g]) => ({
        userId: uid,
        name: memberName(members.find((m) => m.user_id === uid)),
        ...g,
        entries: g.entries.slice().sort((a, b) => b.started_at.localeCompare(a.started_at)),
      }))
      .sort((a, b) => b.total - a.total);
  }, [entries, members, minutesOf]);

  const total = groups.reduce((s, g) => s + g.total, 0);
  const billable = groups.reduce((s, g) => s + g.billable, 0);

  async function remove(e: TimeEntryWithRefs) {
    if (!confirm("Delete this time entry?")) return;
    try {
      await deleteTimeEntry(e.id);
      setEntries((list) => list.filter((x) => x.id !== e.id));
      toast.success("Entry deleted");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (projectLoading) return <p className="text-sm text-neutral-400">Loading…</p>;
  if (notFound || !project) return <p className="text-sm text-neutral-500">Project not found.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
          <span className="text-sm text-neutral-400">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setFrom(format(subDays(new Date(), 30), DAY));
              setTo(format(new Date(), DAY));
            }}
          >
            Last 30 days
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <StartTimerButton projectId={project.id} size="sm" />
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1.5" /> Log time
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <Stat label="Total" value={formatMinutes(total)} />
        <Stat label="Billable" value={formatMinutes(billable)} />
        <Stat label="People" value={String(groups.length)} />
      </div>

      {loading && entries.length === 0 ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="bg-white border rounded p-6 text-center text-sm text-neutral-500">No time logged on this project in this range.</div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.userId} className="bg-white border rounded">
              <header className="flex items-center justify-between px-3 py-2 border-b">
                <p className="text-sm font-medium">
                  {g.name}
                  {g.userId === userId && <span className="text-neutral-400 font-normal"> (me)</span>}
                </p>
                <p className="text-sm text-neutral-600 tabular-nums">
                  {formatMinutes(g.total)} <span className="text-neutral-400">· {formatMinutes(g.billable)} billable</span>
                </p>
              </header>
              <TimeEntriesTable
                entries={g.entries}
                showDate
                showProject={false}
                canEdit={(e) => isAdmin || e.user_id === userId}
                onEdit={(e) => {
                  setEditing(e);
                  setDialogOpen(true);
                }}
                onDelete={remove}
              />
            </section>
          ))}
        </div>
      )}

      <TimeLogDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editing}
        defaults={{ projectId: project.id }}
        lockProject={!!editing}
        onSaved={() => load()}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border rounded px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="text-xl font-semibold mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}
