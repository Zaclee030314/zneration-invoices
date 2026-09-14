"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { Note } from "@/lib/types";
import { memberName, useWorkspace } from "@/lib/workspace";
import { addNote, deleteNote, listNotes } from "@/lib/queries/clients";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/components/projects/ActivityList";

// Timeline of `notes` for a client or a project, newest first, with a composer.
export function NotesPanel({ clientId, projectId, title = "Notes" }: { clientId?: string; projectId?: string; title?: string }) {
  const { members, userId } = useWorkspace();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      setNotes(await listNotes({ clientId, projectId }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [clientId, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function post() {
    if (!body.trim()) return;
    setPosting(true);
    try {
      const n = await addNote({ clientId, projectId }, body);
      setNotes((prev) => [n, ...prev]);
      setBody("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this note?")) return;
    try {
      await deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="bg-white border rounded p-4 space-y-3">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="flex gap-2">
        <Textarea
          rows={2}
          placeholder="Add a note (Ctrl+Enter to post)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
          }}
        />
        <Button size="sm" variant="outline" onClick={post} disabled={posting || !body.trim()}>
          Post
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-neutral-500">Loading...</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-neutral-500">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="group text-sm border-l-2 border-neutral-200 pl-3">
              <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
                <span>
                  <span className="font-medium text-neutral-700">{memberName(members.find((m) => m.user_id === n.author_id))}</span> · {relativeTime(n.created_at)}
                </span>
                {n.author_id === userId && (
                  <button type="button" onClick={() => remove(n.id)} className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-600" title="Delete note">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap mt-0.5">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
