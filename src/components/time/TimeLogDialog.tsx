"use client";
import { useEffect, useState } from "react";
import { addMinutes, format, isValid, parse } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ProjectPicker } from "@/components/ProjectPicker";
import { createTimeEntry, listOpenTasks, updateTimeEntry, type TaskRef, type TimeEntryWithRefs } from "@/lib/queries/time";
import { todayIso } from "@/lib/labels";

const NONE = "__none__";

function atTime(dateIso: string, hhmm: string): Date | null {
  const d = parse(`${dateIso} ${hhmm}`, "yyyy-MM-dd HH:mm", new Date());
  return isValid(d) ? d : null;
}

// Manual time entry (create or edit). Either a start/end time pair or a
// plain duration; duration-only entries are anchored at 09:00 on that date.
export function TimeLogDialog({
  open,
  onOpenChange,
  entry,
  defaults,
  lockProject = false,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: TimeEntryWithRefs | null;
  defaults?: { projectId?: string | null; date?: string };
  lockProject?: boolean;
  onSaved: (entry: TimeEntryWithRefs) => void;
}) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRef[]>([]);
  const [date, setDate] = useState(todayIso());
  const [mode, setMode] = useState<"range" | "duration">("range");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [duration, setDuration] = useState("60");
  const [note, setNote] = useState("");
  const [billable, setBillable] = useState(true);
  const [saving, setSaving] = useState(false);

  const entryId = entry?.id ?? null;
  const defProject = defaults?.projectId ?? null;
  const defDate = defaults?.date ?? null;

  // Reset the form whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (entry) {
      setProjectId(entry.project_id);
      setTaskId(entry.task_id);
      setDate(format(new Date(entry.started_at), "yyyy-MM-dd"));
      setStartTime(format(new Date(entry.started_at), "HH:mm"));
      setEndTime(entry.ended_at ? format(new Date(entry.ended_at), "HH:mm") : format(new Date(), "HH:mm"));
      setDuration(String(entry.duration_min ?? 60));
      setNote(entry.note ?? "");
      setBillable(entry.billable);
      setMode("range");
    } else {
      setProjectId(defProject);
      setTaskId(null);
      setDate(defDate ?? todayIso());
      setStartTime("09:00");
      setEndTime("10:00");
      setDuration("60");
      setNote("");
      setBillable(true);
      setMode("range");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entryId, defProject, defDate]);

  useEffect(() => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    listOpenTasks(projectId)
      .then((list) => {
        if (cancelled) return;
        // Keep the entry's current task selectable even if it is done.
        if (entry?.tasks && entry.project_id === projectId && !list.some((t) => t.id === entry.tasks?.id)) {
          list = [entry.tasks, ...list];
        }
        setTasks(list);
      })
      .catch((e: Error) => toast.error(e.message));
    return () => {
      cancelled = true;
    };
  }, [projectId, entry]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return toast.error("Pick a project");
    let started: Date | null;
    let ended: Date | null;
    if (mode === "range") {
      started = atTime(date, startTime);
      ended = atTime(date, endTime);
      if (!started || !ended) return toast.error("Enter a valid date and times");
      if (ended <= started) return toast.error("End time must be after start time");
    } else {
      const min = parseInt(duration, 10);
      if (!min || min <= 0) return toast.error("Enter a duration in minutes");
      started = atTime(date, entry ? format(new Date(entry.started_at), "HH:mm") : "09:00");
      if (!started) return toast.error("Enter a valid date");
      ended = addMinutes(started, min);
    }
    const input = {
      project_id: projectId,
      task_id: taskId,
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      note: note.trim() || null,
      billable,
    };
    setSaving(true);
    try {
      const saved = entry ? await updateTimeEntry(entry.id, input) : await createTimeEntry(input);
      toast.success(entry ? "Entry updated" : "Time logged");
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit time entry" : "Log time"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1">
            <Label>Project</Label>
            {lockProject && entry?.projects ? (
              <p className="text-sm py-2">
                <span className="font-mono text-xs mr-2">{entry.projects.code}</span>
                {entry.projects.name}
              </p>
            ) : (
              <ProjectPicker
                value={projectId}
                allowClear={false}
                onSelect={(p) => {
                  setProjectId(p?.id ?? null);
                  setTaskId(null);
                }}
              />
            )}
          </div>
          <div className="space-y-1">
            <Label>Task</Label>
            <Select value={taskId ?? NONE} onValueChange={(v) => setTaskId(v === NONE ? null : v)} disabled={!projectId}>
              <SelectTrigger>
                <SelectValue placeholder="No task" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No task</SelectItem>
                {tasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Enter as</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "range" | "duration")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="range">Start & end</SelectItem>
                  <SelectItem value="duration">Duration</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {mode === "range" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>End</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>Duration (minutes)</Label>
              <Input type="number" min={1} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1">
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you work on?" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={billable} onCheckedChange={(v) => setBillable(v === true)} />
            Billable
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : entry ? "Save" : "Log time"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
