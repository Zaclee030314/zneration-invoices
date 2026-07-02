import { supabase } from "./supabase/client";

// Fetches a file from one of our own API routes with the caller's Supabase
// access token attached (routes need it to apply RLS), then triggers a
// browser download of the response body.
export async function downloadFromApi(url: string, filename: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token ?? ""}` },
  });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${await res.text()}`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
