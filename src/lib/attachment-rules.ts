// Rules for files in the private "attachments" bucket. No Supabase client here,
// so API routes can import it too.

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

// Phones often report HEIC photos with an empty type, so fall back to the extension.
export function contentTypeOf(file: { name: string; type: string }): string | null {
  if (ALLOWED_TYPES.has(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_BY_EXT[ext] ?? null;
}

export function attachmentProblem(file: { name: string; type: string; size: number }): string | null {
  if (!contentTypeOf(file)) return "Only JPG, PNG, WEBP or HEIC photos and PDF files can be attached.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "That file is larger than 10 MB.";
  return null;
}

export function safeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").slice(-80);
}

// {workspace_id}/{area}/{record_id}/{timestamp}-{file}: the storage policies check the first folder.
export function attachmentPath(workspaceId: string, area: string, recordId: string, fileName: string): string {
  return `${workspaceId}/${area}/${recordId}/${Date.now()}-${safeFileName(fileName)}`;
}
