"use client";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ProjectPicker } from "@/components/ProjectPicker";
import { useWorkspace, memberName } from "@/lib/workspace";
import { CONTENT_CHANNELS, CONTENT_FORMATS, CONTENT_STATUSES, CONTENT_STATUS_DOT, todayIso } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ContentChannel, ContentFormat, ContentStatus } from "@/lib/types";
import { createContent, deleteContent, saveContent, type ContentInput, type ContentItemWithRefs } from "@/lib/queries/content";

const NONE = "__none__";

export type ContentDefaults = Partial<Pick<ContentInput, "due_date" | "project_id" | "client_id">>;

function blank(defaults?: ContentDefaults): ContentInput {
  return {
    project_id: defaults?.project_id ?? null,
    client_id: defaults?.client_id ?? null,
    task_id: null,
    title: "",
    channel: "instagram",
    format: "post",
    status: "idea",
    due_date: defaults?.due_date ?? todayIso(),
    publish_at: null,
    assignee_id: null,
    caption: null,
    asset_url: null,
    notes: null,
  };
}

function toLocalInput(iso: string | null): string {
  return iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "";
}

// Create/edit one content item. `lockProject` hides the project picker when
// the dialog is opened from inside a project.
export function ContentDialog({
  open,
  onOpenChange,
  item,
  defaults,
  lockProject = false,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ContentItemWithRefs | null;
  defaults?: ContentDefaults;
  lockProject?: boolean;
  onSaved: (item: ContentItemWithRefs) => void;
  onDeleted?: (id: string) => void;
}) {
  const { members } = useWorkspace();
  const [form, setForm] = useState<ContentInput>(blank());
  const [publishAt, setPublishAt] = useState("");
  const [busy, setBusy] = useState(false);

  const itemId = item?.id ?? null;
  const defDue = defaults?.due_date ?? null;
  const defProject = defaults?.project_id ?? null;
  const defClient = defaults?.client_id ?? null;

  useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        project_id: item.project_id,
        client_id: item.client_id,
        task_id: item.task_id,
        title: item.title,
        channel: item.channel,
        format: item.format,
        status: item.status,
        due_date: item.due_date,
        publish_at: item.publish_at,
        assignee_id: item.assignee_id,
        caption: item.caption,
        asset_url: item.asset_url,
        notes: item.notes,
      });
      setPublishAt(toLocalInput(item.publish_at));
    } else {
      setForm(blank({ due_date: defDue ?? undefined, project_id: defProject, client_id: defClient }));
      setPublishAt("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId, defDue, defProject, defClient]);

  function set<K extends keyof ContentInput>(key: K, value: ContentInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function payload(overrides: Partial<ContentInput> = {}): ContentInput {
    const pa = publishAt ? new Date(publishAt) : null;
    return { ...form, publish_at: pa && !isNaN(pa.getTime()) ? pa.toISOString() : null, ...overrides };
  }

  async function submit(overrides: Partial<ContentInput> = {}) {
    if (!form.title.trim()) return toast.error("Title is required");
    if (!form.due_date) return toast.error("Due date is required");
    setBusy(true);
    try {
      const data = payload(overrides);
      const saved = item ? await saveContent(item.id, data) : await createContent(data);
      toast.success(item ? "Content updated" : "Content added");
      onSaved(saved);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!item || !confirm(`Delete "${item.title}"?`)) return;
    setBusy(true);
    try {
      await deleteContent(item.id);
      toast.success("Content deleted");
      onDeleted?.(item.id);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit content" : "New content item"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Launch teaser reel" autoFocus required />
          </div>
          {!lockProject && (
            <div className="space-y-1">
              <Label>Project</Label>
              <ProjectPicker
                value={form.project_id}
                onSelect={(p) => {
                  setForm((f) => ({ ...f, project_id: p?.id ?? null, client_id: p ? p.client_id : f.client_id }));
                }}
              />
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Channel</Label>
              <Select value={form.channel} onValueChange={(v) => set("channel", v as ContentChannel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Format</Label>
              <Select value={form.format} onValueChange={(v) => set("format", v as ContentFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v as ContentStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", CONTENT_STATUS_DOT[s.value])} />
                        {s.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Publish at (optional)</Label>
              <Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Assignee</Label>
            <Select value={form.assignee_id ?? NONE} onValueChange={(v) => set("assignee_id", v === NONE ? null : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {memberName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Caption</Label>
            <Textarea rows={3} value={form.caption ?? ""} onChange={(e) => set("caption", e.target.value)} placeholder="Post copy, hashtags…" />
          </div>
          <div className="space-y-1">
            <Label>Asset URL</Label>
            <Input type="url" value={form.asset_url ?? ""} onChange={(e) => set("asset_url", e.target.value)} placeholder="https://drive.google.com/…" />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <DialogFooter className="sm:justify-between gap-2">
            <div className="flex gap-2">
              {item && (
                <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" onClick={remove} disabled={busy}>
                  Delete
                </Button>
              )}
              {form.status !== "published" && (
                <Button type="button" variant="outline" onClick={() => submit({ status: "published" })} disabled={busy}>
                  Mark published
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : item ? "Save" : "Add item"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
