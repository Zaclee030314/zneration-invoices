"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { ActivityEntry, Milestone, Priority, Task, TaskComment, TaskStatus } from "@/lib/types";
import { PRIORITIES, TASK_STATUSES } from "@/lib/labels";
import { memberName, useWorkspace } from "@/lib/workspace";
import { addComment, createTask, deleteTask, listComments, listTaskActivity, updateTask, type TaskInput } from "@/lib/queries/tasks";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StartTimerButton } from "@/components/time/StartTimerButton";
import { ActivityList, relativeTime } from "@/components/projects/ActivityList";

const NONE = "__none__";

interface FormState {
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee_id: string;
  milestone_id: string;
  due_date: string;
  labels: string;
  estimate_min: string;
}

function toForm(task: Task | null, defaults?: Partial<Task>): FormState {
  const t = task ?? defaults ?? {};
  return {
    title: t.title ?? "",
    description: t.description ?? "",
    status: t.status ?? "todo",
    priority: t.priority ?? "medium",
    assignee_id: t.assignee_id ?? NONE,
    milestone_id: t.milestone_id ?? NONE,
    due_date: t.due_date ?? "",
    labels: (t.labels ?? []).join(", "),
    estimate_min: t.estimate_min != null ? String(t.estimate_min) : "",
  };
}

function toInput(f: FormState): TaskInput {
  return {
    title: f.title,
    description: f.description,
    status: f.status,
    priority: f.priority,
    assignee_id: f.assignee_id === NONE ? null : f.assignee_id,
    milestone_id: f.milestone_id === NONE ? null : f.milestone_id,
    due_date: f.due_date || null,
    labels: f.labels.split(",").map((s) => s.trim()).filter(Boolean),
    estimate_min: f.estimate_min.trim() ? Math.max(0, parseInt(f.estimate_min, 10) || 0) : null,
  };
}

// Right-hand sheet for creating (task=null) or editing one task.
export function TaskDialog({
  open,
  onOpenChange,
  projectId,
  task,
  milestones,
  defaults,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  task: Task | null;
  milestones: Milestone[];
  defaults?: Partial<Task>;
  onSaved: (task: Task) => void;
  onDeleted?: (id: string) => void;
}) {
  const { members } = useWorkspace();
  const [form, setForm] = useState<FormState>(() => toForm(task, defaults));
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [sideLoading, setSideLoading] = useState(false);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(toForm(task, defaults));
    setComment("");
    if (!task) {
      setComments([]);
      setActivity([]);
      return;
    }
    setSideLoading(true);
    Promise.all([listComments(task.id), listTaskActivity(task.id)])
      .then(([c, a]) => {
        setComments(c);
        setActivity(a);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setSideLoading(false));
    // `defaults` is read only when the sheet opens so callers can pass inline objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Title is required");
    setSaving(true);
    try {
      const saved = task ? await updateTask(task.id, toInput(form)) : await createTask(projectId, toInput(form));
      toast.success(task ? "Task updated" : "Task created");
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!task || !confirm(`Delete task "${task.title}"? This cannot be undone.`)) return;
    try {
      await deleteTask(task.id);
      toast.success("Task deleted");
      onDeleted?.(task.id);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function postComment() {
    if (!task || !comment.trim()) return;
    try {
      const c = await addComment(task.id, comment);
      setComments((prev) => [...prev, c]);
      setComment("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const authorName = (id: string | null) => memberName(members.find((m) => m.user_id === id));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        <form onSubmit={save} className="flex flex-col min-h-full">
          <SheetHeader className="px-6 pt-6 pb-3 border-b">
            <SheetTitle className="text-base flex items-center gap-2">
              {task ? "Edit task" : "New task"}
              {task && <StartTimerButton projectId={projectId} taskId={task.id} size="sm" />}
            </SheetTitle>
          </SheetHeader>
          <div className="px-6 py-4 space-y-4 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input id="task-title" value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-desc">Description</Label>
              <Textarea id="task-desc" rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => set("status", v as TaskStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={form.priority} onValueChange={(v) => set("priority", v as Priority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Assignee">
                <Select value={form.assignee_id} onValueChange={(v) => set("assignee_id", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unassigned</SelectItem>
                    {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{memberName(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Milestone">
                <Select value={form.milestone_id} onValueChange={(v) => set("milestone_id", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No milestone</SelectItem>
                    {milestones.map((m) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Due date">
                <Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} />
              </Field>
              <Field label="Estimate (minutes)">
                <Input type="number" min={0} step={15} value={form.estimate_min} onChange={(e) => set("estimate_min", e.target.value)} />
              </Field>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-labels">Labels</Label>
              <Input id="task-labels" placeholder="design, bug, client-request" value={form.labels} onChange={(e) => set("labels", e.target.value)} />
              <p className="text-xs text-neutral-400">Comma separated.</p>
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              {task ? (
                <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={remove}>
                  <Trash2 /> Delete
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving..." : task ? "Save" : "Create task"}</Button>
              </div>
            </div>
          </div>

          {task && (
            <div className="border-t px-6 py-4 space-y-5 text-sm bg-neutral-50/60 flex-1">
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">Comments</h3>
                {sideLoading ? (
                  <p className="text-neutral-500">Loading...</p>
                ) : comments.length === 0 ? (
                  <p className="text-neutral-500">No comments yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {comments.map((c) => (
                      <li key={c.id} className="bg-white border rounded p-2.5">
                        <p className="text-xs text-neutral-500 mb-1">
                          <span className="font-medium text-neutral-700">{authorName(c.author_id)}</span> · {relativeTime(c.created_at)}
                        </p>
                        <p className="whitespace-pre-wrap">{c.body}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  <Textarea
                    rows={2}
                    placeholder="Write a comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postComment();
                    }}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={postComment} disabled={!comment.trim()}>Post</Button>
                </div>
              </section>
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-1">Activity</h3>
                <ActivityList entries={activity} loading={sideLoading} />
              </section>
            </div>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
