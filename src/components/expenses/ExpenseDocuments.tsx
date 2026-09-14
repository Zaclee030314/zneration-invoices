"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import type { BankTransaction, ExpenseDocKind, ExpenseDocument } from "@/lib/types";
import { EXPENSE_DOC_KINDS, formatDate } from "@/lib/labels";
import { ATTACHMENT_ACCEPT, openAttachment } from "@/lib/attachments";
import { deleteDocument, fetchDocuments, updateDocument, uploadExpenseDocument } from "@/lib/queries/expenses";
import { memberName, useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Supplier invoices, receipts and agreements backing one payment.
export function ExpenseDocuments({
  transaction,
  onCountChange,
}: {
  transaction: Pick<BankTransaction, "id" | "workspace_id">;
  onCountChange: (count: number) => void;
}) {
  const { members } = useWorkspace();
  const [docs, setDocs] = useState<ExpenseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<ExpenseDocKind>("receipt");
  const [progress, setProgress] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDocuments(transaction.id).then((res) => {
      if (cancelled) return;
      if (res.error !== null) toast.error(res.error);
      else {
        setDocs(res.data);
        onCountChange(res.data.length);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // onCountChange is a fresh closure on every render; reload only for another transaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction.id]);

  async function addFiles(files: FileList | null) {
    if (!files?.length || progress) return;
    const list = Array.from(files);
    let next = docs;
    for (let i = 0; i < list.length; i++) {
      setProgress(list.length > 1 ? `Uploading ${i + 1} of ${list.length}...` : "Uploading...");
      const res = await uploadExpenseDocument(transaction, list[i], kind);
      if (res.error !== null) toast.error(`${list[i].name}: ${res.error}`);
      else {
        next = [...next, res.data];
        setDocs(next);
      }
    }
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    onCountChange(next.length);
  }

  async function changeKind(doc: ExpenseDocument, value: ExpenseDocKind) {
    const res = await updateDocument(doc.id, { kind: value });
    if (res.error !== null) return toast.error(res.error);
    setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, kind: value } : d)));
  }

  async function remove(doc: ExpenseDocument) {
    if (!confirm(`Remove "${doc.file_name}"?`)) return;
    const res = await deleteDocument(doc);
    if (res.error !== null) return toast.error(res.error);
    const next = docs.filter((d) => d.id !== doc.id);
    setDocs(next);
    onCountChange(next.length);
  }

  async function view(doc: ExpenseDocument) {
    const error = await openAttachment(doc.file_path);
    if (error) toast.error(error);
  }

  return (
    <section
      className={cn("space-y-2 rounded", dragging && "outline-dashed outline-2 outline-neutral-400")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Invoices and receipts</h3>
      {loading ? (
        <p className="text-neutral-500">Loading...</p>
      ) : docs.length === 0 ? (
        <p className="text-neutral-500">Nothing attached yet. Add the supplier invoice, receipt or agreement, or drop files here.</p>
      ) : (
        <ul className="divide-y rounded border bg-white">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 p-2">
              <FileText className="size-4 shrink-0 text-neutral-400" />
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => view(d)} className="block max-w-full truncate text-left font-medium hover:underline">
                  {d.file_name}
                </button>
                <p className="text-xs text-neutral-500">
                  {[d.uploaded_by ? memberName(members.find((m) => m.user_id === d.uploaded_by)) : null, formatDate(d.created_at), d.size_bytes ? formatSize(d.size_bytes) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <select
                aria-label="Document type"
                className="rounded border px-1.5 py-1 text-xs"
                value={d.kind}
                onChange={(e) => changeKind(d, e.target.value as ExpenseDocKind)}
              >
                {EXPENSE_DOC_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => remove(d)} aria-label="Remove document">
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Type of new documents" className="rounded border px-2 py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value as ExpenseDocKind)}>
          {EXPENSE_DOC_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <input ref={inputRef} type="file" multiple accept={ATTACHMENT_ACCEPT} className="sr-only" onChange={(e) => addFiles(e.target.files)} />
        <Button type="button" variant="outline" size="sm" disabled={!!progress} onClick={() => inputRef.current?.click()}>
          <Paperclip /> {progress ?? "Add documents"}
        </Button>
        <span className="text-xs text-neutral-400">PDF or photo, up to 10 MB each</span>
      </div>
    </section>
  );
}
