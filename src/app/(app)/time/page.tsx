"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, isSameDay, isSameMonth, isSameYear, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TimeEntriesTable } from "@/components/time/TimeEntriesTable";
import { TimeLogDialog } from "@/components/time/TimeLogDialog";
import { useWorkspace, memberName } from "@/lib/workspace";
import { useTimer } from "@/lib/timer";
import { deleteTimeEntry, entryMinutes, listTimeEntries, type TimeEntryWithRefs } from "@/lib/queries/time";
import { formatMinutes } from "@/lib/labels";

function weekTitle(start: Date): string {
  const end = addDays(start, 6);
  if (isSameMonth(start, end)) return `${format(start, "d")}–${format(end, "d MMM yyyy")}`;
  if (isSameYear(start, end)) return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
  return `${format(start, "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
}

export default function TimePage() {
  const { userId, isAdmin, members, loading: wsLoading } = useWorkspace();
  const { running, elapsedSec, version } = useTimer();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [memberId, setMemberId] = useState<string | null>(null);
  const [entries, setEntries] = useState<TimeEntryWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntryWithRefs | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | undefined>(undefined);

  const viewedUser = memberId ?? userId;

  const load = useCallback(async () => {
    if (!viewedUser) return;
    setLoading(true);
    try {
      setEntries(await listTimeEntries({ from: weekStart, to: addDays(weekStart, 7), userId: viewedUser }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [weekStart, viewedUser]);

  useEffect(() => {
    load();
  }, [load, version]);

  // Live minutes for one entry (the running one ticks with the sidebar clock).
  const minutesOf = useCallback(
    (e: TimeEntryWithRefs) => (running && e.id === running.id ? Math.floor(elapsedSec / 60) : entryMinutes(e)),
    [running, elapsedSec]
  );

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const list = entries
        .filter((e) => isSameDay(new Date(e.started_at), date))
        .sort((a, b) => (a.ended_at ? 1 : 0) - (b.ended_at ? 1 : 0) || a.started_at.localeCompare(b.started_at));
      return { date, entries: list, total: list.reduce((s, e) => s + minutesOf(e), 0) };
    });
  }, [entries, weekStart, minutesOf]);

  const weekTotal = days.reduce((s, d) => s + d.total, 0);

  const byProject = useMemo(() => {
    const map = new Map<string, { code: string; name: string; total: number; billable: number }>();
    for (const e of entries) {
      const key = e.project_id;
      const row = map.get(key) ?? { code: e.projects?.code ?? "", name: e.projects?.name ?? "Project", total: 0, billable: 0 };
      const min = minutesOf(e);
      row.total += min;
      if (e.billable) row.billable += min;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [entries, minutesOf]);

  const canEdit = (e: TimeEntryWithRefs) => isAdmin || e.user_id === userId;

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

  function openLog(date?: string) {
    setEditing(null);
    setDefaultDate(date);
    setDialogOpen(true);
  }

  const today = new Date();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold">Time</h1>
        <Button onClick={() => openLog()}>
          <Plus className="h-4 w-4 mr-1.5" /> Log time
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((d) => addDays(d, -7))} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((d) => addDays(d, 7))} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            Today
          </Button>
        </div>
        <p className="text-sm font-medium ml-1">{weekTitle(weekStart)}</p>
        <span className="text-sm text-neutral-400">·</span>
        <p className="text-sm text-neutral-600">{formatMinutes(weekTotal)} this week</p>
        {isAdmin && members.length > 1 && (
          <div className="ml-auto">
            <Select value={viewedUser ?? undefined} onValueChange={(v) => setMemberId(v)}>
              <SelectTrigger className="h-8 w-48">
                <SelectValue placeholder="Member" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {memberName(m)}
                    {m.user_id === userId ? " (me)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {wsLoading || (loading && entries.length === 0) ? (
        <p className="text-sm text-neutral-400">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
          <div className="space-y-4">
            {entries.length === 0 && !loading && (
              <div className="bg-white border rounded p-6 text-center text-sm text-neutral-500">
                Nothing logged this week.{" "}
                <button className="underline" onClick={() => openLog()}>
                  Log time
                </button>{" "}
                or start a timer from the sidebar.
              </div>
            )}
            {days.map((d) => {
              const isToday = isSameDay(d.date, today);
              if (d.entries.length === 0 && !isToday) return null;
              return (
                <section key={d.date.toISOString()} className="bg-white border rounded">
                  <header className="flex items-center justify-between px-3 py-2 border-b">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{format(d.date, "EEEE, d MMM")}</p>
                      {isToday && <span className="text-[11px] uppercase tracking-wide text-neutral-400">Today</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-neutral-600 tabular-nums">{formatMinutes(d.total)}</p>
                      {(!viewedUser || viewedUser === userId) && (
                        <button className="text-xs text-neutral-500 hover:text-neutral-900" onClick={() => openLog(format(d.date, "yyyy-MM-dd"))}>
                          + Log
                        </button>
                      )}
                    </div>
                  </header>
                  <TimeEntriesTable
                    entries={d.entries}
                    canEdit={canEdit}
                    onEdit={(e) => {
                      setEditing(e);
                      setDialogOpen(true);
                    }}
                    onDelete={remove}
                  />
                </section>
              );
            })}
          </div>

          <aside className="bg-white border rounded">
            <header className="px-3 py-2 border-b">
              <p className="text-sm font-medium">By project</p>
            </header>
            {byProject.length === 0 ? (
              <p className="text-sm text-neutral-400 px-3 py-3">No time this week.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Billable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byProject.map((p) => (
                    <TableRow key={p.code + p.name}>
                      <TableCell>
                        <span className="font-mono text-xs text-neutral-500 mr-1.5">{p.code}</span>
                        <span className="text-sm">{p.name}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMinutes(p.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-neutral-500">{formatMinutes(p.billable)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-medium">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMinutes(weekTotal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMinutes(byProject.reduce((s, p) => s + p.billable, 0))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </aside>
        </div>
      )}

      <TimeLogDialog open={dialogOpen} onOpenChange={setDialogOpen} entry={editing} defaults={{ date: defaultDate }} onSaved={() => load()} />
    </div>
  );
}
