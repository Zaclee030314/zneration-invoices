import { supabase } from "./supabase/client";

// The signed-in user's access token. getSession can return a token that has
// already expired (the tab was idle or asleep), so refresh when it is about to.
export async function accessToken(forceRefresh = false): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return "";
  if (forceRefresh || (session.expires_at ?? 0) * 1000 < Date.now() + 60_000) {
    const refreshed = await supabase.auth.refreshSession();
    return refreshed.data.session?.access_token ?? session.access_token;
  }
  return session.access_token;
}

// JSON call to one of our own API routes with the caller's Supabase access
// token attached, so the route can act as that user (RLS applies).
export async function apiJson<T = unknown>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
  const send = (token: string) =>
    fetch(url, {
      method: body === undefined ? "GET" : "POST",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  let res = await send(await accessToken());
  // The stored token can expire while a tab sits idle; refresh it and try once more.
  if (res.status === 401) res = await send(await accessToken(true));
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { error: text };
  }
  if (!res.ok) {
    const msg = (parsed as { error?: string } | null)?.error ?? `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return parsed as T;
}
