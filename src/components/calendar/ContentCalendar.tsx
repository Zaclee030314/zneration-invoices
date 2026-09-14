"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, isSameMonth, parseISO } from "date-fns";
import { toast } from "sonner";
import { CalendarToolbar, type CalendarView, type ContentFilters } from "./CalendarToolbar";
import { ContentDialog, type ContentDefaults } from "./ContentDialog";
import { ContentList } from "./ContentList";
import { MonthGrid, gridStart } from "./MonthGrid";
import { useWorkspace } from "@/lib/workspace";
import { listContent, updateContent, type ContentItemWithRefs } from "@/lib/queries/content";
import type { ContentStatus } from "@/lib/types";

// Month/list content calendar. Pass projectId (+ clientId) to scope it to
// one project: the project filter is hidden and new items are prefilled.
export function ContentCalendar({
  projectId,
  clientId,
  defaultView = "month",
}: {
  projectId?: string;
  clientId?: string | null;
  defaultView?: CalendarView;
}) {
  const { members, loading: wsLoading } = useWorkspace();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [view, setView] = useState<CalendarView>(defaultView);
  const [filters, setFilters] = useState<ContentFilters>({ projectId: projectId ?? null, channel: null, status: null, assigneeId: null });
  const [items, setItems] = useState<ContentItemWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContentItemWithRefs | null>(null);
  const [defaults, setDefaults] = useState<ContentDefaults>({});

  const effectiveProject = projectId ?? filters.projectId;

  // Fetch the whole 6-week grid so outside days show their items too.
  const load = useCallback(async () => {
    const start = gridStart(month);
    setLoading(true);
    try {
      setItems(
        await listContent({
          from: format(start, "yyyy-MM-dd"),
          to: format(addDays(start, 41), "yyyy-MM-dd"),
          projectId: effectiveProject,
          channel: filters.channel,
          status: filters.status,
          assigneeId: filters.assigneeId,
        })
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [month, effectiveProject, filters.channel, filters.status, filters.assigneeId]);

  useEffect(() => {
    load();
  }, [load]);

  const monthItems = useMemo(() => items.filter((it) => isSameMonth(parseISO(it.due_date), month)), [items, month]);

  function openNew(dateIso?: string) {
    setEditing(null);
    setDefaults({ due_date: dateIso, project_id: projectId ?? null, client_id: projectId ? clientId ?? null : null });
    setDialogOpen(true);
  }

  function openEdit(item: ContentItemWithRefs) {
    setEditing(item);
    setDialogOpen(true);
  }

  async function changeStatus(item: ContentItemWithRefs, status: ContentStatus) {
    const prev = items;
    setItems((list) => list.map((x) => (x.id === item.id ? { ...x, status } : x)));
    try {
      await updateContent(item.id, { status });
    } catch (e) {
      setItems(prev);
      toast.error((e as Error).message);
    }
  }

  const counts = useMemo(() => {
    const total = monthItems.length;
    const published = monthItems.filter((i) => i.status === "published").length;
    return { total, published };
  }, [monthItems]);

  return (
    <div>
      <CalendarToolbar
        month={month}
        onMonthChange={setMonth}
        view={view}
        onViewChange={setView}
        filters={filters}
        onFiltersChange={setFilters}
        members={members}
        showProjectFilter={!projectId}
        onNew={() => openNew()}
      />

      <p className="text-xs text-neutral-400 mb-2">
        {loading && items.length === 0 ? "Loading…" : `${counts.total} item${counts.total === 1 ? "" : "s"} this month · ${counts.published} published`}
      </p>

      {wsLoading && items.length === 0 ? null : view === "month" ? (
        <MonthGrid month={month} items={items} onSelectItem={openEdit} onSelectDate={(iso) => openNew(iso)} />
      ) : (
        <ContentList items={monthItems} members={members} showProject={!projectId} onSelectItem={openEdit} onStatusChange={changeStatus} />
      )}

      <ContentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editing}
        defaults={defaults}
        lockProject={!!projectId}
        onSaved={() => load()}
        onDeleted={(id) => setItems((list) => list.filter((x) => x.id !== id))}
      />
    </div>
  );
}
