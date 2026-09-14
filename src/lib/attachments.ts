// Files attached to records: payment slips, expense receipts and invoices, bank
// statement PDFs. Stored in the private "attachments" bucket under
// {workspace_id}/..., which the storage policies in migration 008 use to limit
// access to the workspace.
import { supabase } from "@/lib/supabase/client";
import { ATTACHMENTS_BUCKET, attachmentPath, attachmentProblem, contentTypeOf } from "@/lib/attachment-rules";

export { ATTACHMENTS_BUCKET, ATTACHMENT_ACCEPT, MAX_ATTACHMENT_BYTES, attachmentProblem } from "@/lib/attachment-rules";

type Result<T> = { data: T; error: null } | { data: null; error: string };

// Uploads the file, then runs `link` to record it on the owning row. If linking
// fails the uploaded file is removed again so storage never holds orphans.
export async function uploadAttachment<T>({
  workspaceId,
  area,
  recordId,
  file,
  link,
}: {
  workspaceId: string;
  area: string;
  recordId: string;
  file: File;
  link: (path: string, contentType: string) => Promise<Result<T>>;
}): Promise<Result<T>> {
  const problem = attachmentProblem(file);
  if (problem) return { data: null, error: problem };
  const contentType = contentTypeOf(file) as string;
  const path = attachmentPath(workspaceId, area, recordId, file.name);
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) return { data: null, error: error.message };
  const linked = await link(path, contentType);
  if (linked.error !== null) await removeAttachments([path]);
  return linked;
}

export async function uploadPaymentSlip(payment: { id: string; workspace_id: string }, file: File): Promise<Result<string>> {
  return uploadAttachment({
    workspaceId: payment.workspace_id,
    area: "payments",
    recordId: payment.id,
    file,
    link: async (path) => {
      const { error } = await supabase.from("payments").update({ slip_path: path }).eq("id", payment.id);
      return error ? { data: null, error: error.message } : { data: path, error: null };
    },
  });
}

// The tab is opened before the await so popup blockers still count it as part of the click.
export async function openAttachment(path: string): Promise<string | null> {
  const win = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, 300);
  if (error || !data) {
    win?.close();
    return error?.message ?? "Could not open the file.";
  }
  if (win) {
    win.opener = null;
    win.location.href = data.signedUrl;
  } else {
    window.location.href = data.signedUrl;
  }
  return null;
}

export async function removeAttachment(path: string): Promise<void> {
  await removeAttachments([path]);
}

export async function removeAttachments(paths: string[]): Promise<void> {
  if (paths.length) await supabase.storage.from(ATTACHMENTS_BUCKET).remove(paths);
}
