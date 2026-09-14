"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import type { StatementImportResult, StatementPreview } from "@/lib/types";
import { formatDate } from "@/lib/labels";
import { formatRM } from "@/lib/company";
import { removeAttachments } from "@/lib/attachments";
import { importStatement, previewStatement, uploadStatementPdf } from "@/lib/queries/expenses";
import { useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Stage = "uploading" | "checking" | "ready" | "importing" | "imported" | "skipped" | "failed";

interface Item {
  key: string;
  file: File;
  stage: Stage;
  statementId?: string;
  path?: string;
  preview?: StatementPreview;
  result?: StatementImportResult;
  error?: string;
}

const BUSY: Stage[] = ["uploading", "checking", "importing"];

function canImport(it: Item): boolean {
  return it.stage === "ready" && !!it.preview?.ok && !it.preview.alreadyImported && it.preview.newCount > 0;
}

// Upload one or more statement PDFs; each is checked on the server and shown
// before anything is imported.
export function StatementImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const { workspaceId } = useWorkspace();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  const busy = items.some((it) => BUSY.includes(it.stage));
  const ready = items.filter(canImport);

  const update = (key: string, patch: Partial<Item>) => setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  async function addFiles(files: FileList | null) {
    if (!files?.length || !workspaceId) return;
    const added: Item[] = Array.from(files).map((file) => ({ key: crypto.randomUUID(), file, stage: "uploading" }));
    setItems((prev) => [...prev, ...added]);
    if (inputRef.current) inputRef.current.value = "";
    for (const it of added) {
      const upload = await uploadStatementPdf(workspaceId, it.file);
      if (upload.error !== null) {
        update(it.key, { stage: "failed", error: upload.error });
        continue;
      }
      update(it.key, { stage: "checking", ...upload.data });
      const preview = await previewStatement({ ...upload.data, fileName: it.file.name });
      if (preview.error !== null) {
        await removeAttachments([upload.data.path]);
        update(it.key, { stage: "failed", error: preview.error, path: undefined });
        continue;
      }
      update(it.key, { stage: "ready", preview: preview.data });
    }
  }

  async function importOne(it: Item): Promise<boolean> {
    if (!canImport(it) || !it.statementId || !it.path) return false;
    update(it.key, { stage: "importing", error: undefined });
    const res = await importStatement({ statementId: it.statementId, path: it.path, fileName: it.file.name });
    if (res.error !== null) {
      update(it.key, { stage: "ready", error: res.error });
      return false;
    }
    if (res.data.status === "already_imported") {
      await removeAttachments([it.path]);
      update(it.key, { stage: "skipped", result: res.data, path: undefined });
      return false;
    }
    update(it.key, { stage: "imported", result: res.data });
    return true;
  }

  async function importSingle(it: Item) {
    if (await importOne(it)) {
      toast.success(`Imported ${it.file.name}`);
      onImported();
    }
  }

  async function importAll() {
    let count = 0;
    for (const it of itemsRef.current.filter(canImport)) {
      if (await importOne(it)) count++;
    }
    if (count) {
      toast.success(`Imported ${count} statement${count === 1 ? "" : "s"}.`);
      onImported();
    }
  }

  async function discard(it: Item) {
    if (it.path && it.stage !== "imported") await removeAttachments([it.path]);
    setItems((prev) => prev.filter((x) => x.key !== it.key));
  }

  async function close(next: boolean) {
    if (next) return onOpenChange(true);
    if (busy) {
      toast.error("Wait for the current upload or import to finish.");
      return;
    }
    const leftovers = itemsRef.current.filter((it) => it.path && it.stage !== "imported").map((it) => it.path as string);
    if (leftovers.length) await removeAttachments(leftovers);
    setItems([]);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload bank statements</DialogTitle>
          <DialogDescription>
            PDF statements from UOB (Account Activities export) or Public Bank. Each file is checked before anything is imported, and transactions
            already imported from another file are skipped.
          </DialogDescription>
        </DialogHeader>

        <div
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
          className={cn("rounded border-2 border-dashed p-6 text-center text-sm text-neutral-500", dragging && "border-neutral-500 bg-neutral-50")}
        >
          <Upload className="mx-auto mb-2 size-5" />
          Drop PDF statements here or{" "}
          <button type="button" className="underline" onClick={() => inputRef.current?.click()}>
            choose files
          </button>
          <input ref={inputRef} type="file" multiple accept="application/pdf,.pdf" className="sr-only" onChange={(e) => addFiles(e.target.files)} />
        </div>

        {items.length > 0 && (
          <ul className="space-y-3">
            {items.map((it) => (
              <ItemCard key={it.key} item={it} onImport={() => importSingle(it)} onDiscard={() => discard(it)} />
            ))}
          </ul>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>
            Close
          </Button>
          <Button type="button" onClick={importAll} disabled={busy || ready.length === 0}>
            Import all ready ({ready.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemCard({ item, onImport, onDiscard }: { item: Item; onImport: () => void; onDiscard: () => void }) {
  const pv = item.preview;
  const stageText: Record<Stage, string> = {
    uploading: "Uploading...",
    checking: "Reading and checking the statement...",
    ready: pv?.ok ? "Checked" : "Did not pass the checks",
    importing: "Importing...",
    imported: "Imported",
    skipped: "Already imported",
    failed: "Could not be read",
  };
  return (
    <li className="space-y-2 rounded border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.file.name}</p>
          <p className={cn("text-xs", item.stage === "failed" || (item.stage === "ready" && !pv?.ok) ? "text-red-700" : "text-neutral-500")}>
            {stageText[item.stage]}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {item.stage === "ready" && (
            <Button type="button" size="sm" disabled={!canImport(item)} onClick={onImport}>
              Import
            </Button>
          )}
          {(item.stage === "ready" || item.stage === "failed" || item.stage === "skipped") && (
            <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
              Remove
            </Button>
          )}
        </div>
      </div>

      {pv && (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-neutral-500">Account</dt>
              <dd>
                {pv.accountLabel || (pv.bank === "PBB" ? "Public Bank" : "UOB")} {pv.accountNo}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Period</dt>
              <dd>
                {formatDate(pv.periodStart)} – {formatDate(pv.periodEnd)}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Transactions</dt>
              <dd>
                {pv.txnCount} ({pv.moneyOutCount} out)
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Money in / out</dt>
              <dd className="tabular-nums">
                {formatRM(pv.totalIn)} / {formatRM(pv.totalOut)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-neutral-500">Opening → closing balance</dt>
              <dd className="tabular-nums">
                {formatRM(pv.openingBalance)} → {formatRM(pv.closingBalance)}
              </dd>
            </div>
          </dl>
          <ul className="space-y-0.5 text-xs">
            {pv.checks.map((c) => (
              <li key={c.code} className={c.ok ? "text-emerald-700" : "text-red-700"}>
                {c.ok ? "✓" : "✗"} {c.message}
              </li>
            ))}
            {pv.warnings.map((w, i) => (
              <li key={`w${i}`} className="text-amber-700">
                ! {w}
              </li>
            ))}
          </ul>
          {pv.alreadyImported ? (
            <p className="text-xs text-sky-700">
              This exact file was already imported on {formatDate(pv.alreadyImported.created_at)} ({pv.alreadyImported.file_name}).
            </p>
          ) : pv.ok ? (
            <p className="text-xs text-neutral-600">
              {pv.newCount} new transaction{pv.newCount === 1 ? "" : "s"}
              {pv.duplicateCount ? `, ${pv.duplicateCount} already imported from another statement` : ""}.
              {pv.newCount === 0 && " Nothing to import."}
            </p>
          ) : (
            <p className="text-xs text-red-700">This statement cannot be imported until it passes every check. Try exporting it again from the bank.</p>
          )}
        </>
      )}

      {item.error && <p className="text-xs text-red-700">{item.error}</p>}
      {item.stage === "imported" && item.result && (
        <p className="text-xs text-emerald-700">
          Added {item.result.inserted ?? 0} transaction{item.result.inserted === 1 ? "" : "s"}
          {item.result.duplicates ? `, skipped ${item.result.duplicates} already imported` : ""}.
        </p>
      )}
    </li>
  );
}
