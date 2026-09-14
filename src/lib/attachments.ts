// Files attached to records (payment slips for now). Stored in the private
// "attachments" bucket under {workspace_id}/..., which the storage policies in
// migration 008 use to limit access to the workspace.
import { supabase } from "@/lib/supabase/client";

export const ATTACHMENTS_BUCKET = "attachments";
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = "image/*,application/pdf,.heic,.heif";

// Must stay in sync with allowed_mime_types on the bucket.
const TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};
const ALLOWED_TYPES = new Set(Object.values(TYPE_BY_EXT));

type Result<T> = { data: T; error: null } | { data: null; error: string };

// Phones often report HEIC photos with an empty type, so fall back to the extension.
function contentTypeOf(file: File): string | null {
  if (ALLOWED_TYPES.has(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_BY_EXT[ext] ?? null;
}

export function attachmentProblem(file: File): string | null {
  if (!contentTypeOf(file)) return "Only JPG, PNG, WEBP or HEIC photos and PDF files can be attached.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "That file is larger than 10 MB.";
  return null;
}

export async function uploadPaymentSlip(payment: { id: string; workspace_id: string }, file: File): Promise<Result<string>> {
  const problem = attachmentProblem(file);
  if (problem) return { data: null, error: problem };
  const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
  const path = `${payment.workspace_id}/payments/${payment.id}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(path, file, { contentType: contentTypeOf(file) ?? undefined, upsert: false });
  if (error) return { data: null, error: error.message };
  const { error: linkErr } = await supabase.from("payments").update({ slip_path: path }).eq("id", payment.id);
  if (linkErr) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path]);
    return { data: null, error: linkErr.message };
  }
  return { data: path, error: null };
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
  await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path]);
}
