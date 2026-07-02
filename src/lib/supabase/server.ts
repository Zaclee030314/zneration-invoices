import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

// Server-side client used by API routes. Forwards the caller's Supabase
// access token (sent via Authorization header from the browser) so RLS
// policies apply exactly as they would for a direct client-side query.
export function supabaseForRequest(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  return createClient(url, key, {
    global: { headers: { Authorization: authHeader } },
  });
}
