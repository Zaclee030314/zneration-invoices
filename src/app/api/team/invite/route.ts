import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase/server";
import { activeWorkspaceId } from "@/lib/supabase/active-workspace";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// POST { email, role } — admin only. Records the invite, then either emails
// a Supabase invite (new user) or adds the existing user straight away.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: string; role?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const role = body?.role === "admin" ? "admin" : "member";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const db = supabaseForRequest(req);
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const workspaceId = await activeWorkspaceId(db, user.id);
  if (!workspaceId) return NextResponse.json({ error: "No workspace." }, { status: 403 });

  const { data: isAdmin } = await db.rpc("is_workspace_admin", { ws: workspaceId });
  if (!isAdmin) return NextResponse.json({ error: "Only admins can invite." }, { status: 403 });

  // Record the invite (RLS: admin only). Re-inviting updates the role.
  const { error: inviteErr } = await db
    .from("workspace_invites")
    .upsert({ workspace_id: workspaceId, email, role, invited_by: user.id, accepted_at: null }, { onConflict: "workspace_id,email" });
  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 400 });

  let admin;
  try {
    admin = supabaseAdmin();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // Existing account? Add membership directly and mark the invite accepted.
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing?.id) {
    const { error: memErr } = await admin
      .from("workspace_members")
      .upsert({ workspace_id: workspaceId, user_id: existing.id, role }, { onConflict: "workspace_id,user_id" });
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
    await admin.from("workspace_invites").update({ accepted_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("email", email);
    return NextResponse.json({ ok: true, status: "added" });
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const { error: sendErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/auth/confirm` });
  if (sendErr) return NextResponse.json({ error: sendErr.message }, { status: 400 });
  return NextResponse.json({ ok: true, status: "invited" });
}
