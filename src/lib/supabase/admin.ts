import { createClient } from "@supabase/supabase-js";

// Service-role client. SERVER ONLY: never import from a client component.
// Used for the handful of operations the anon key cannot do (inviting users).
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
