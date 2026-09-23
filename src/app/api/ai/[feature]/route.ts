import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase/server";
import { activeWorkspaceId } from "@/lib/supabase/active-workspace";
import { getFeature } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/ai/<feature> { ...input }
// Authenticates the caller, records the run in ai_runs, and dispatches to the
// registered feature. Until a feature is registered this returns 501.
export async function POST(req: Request, { params }: { params: { feature: string } }) {
  const db = supabaseForRequest(req);
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const workspaceId = await activeWorkspaceId(db, user.id);
  if (!workspaceId) return NextResponse.json({ error: "No workspace." }, { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI features are not enabled (ANTHROPIC_API_KEY missing)." }, { status: 503 });

  const feature = getFeature(params.feature);
  if (!feature) return NextResponse.json({ error: `AI feature "${params.feature}" is not available yet.` }, { status: 501 });

  const input = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { data: run } = await db
    .from("ai_runs")
    .insert({ workspace_id: workspaceId, user_id: user.id, feature: feature.name, project_id: (input.project_id as string) ?? null, input })
    .select("id")
    .single();

  try {
    const result = await feature.run(input, { db, userId: user.id, workspaceId, apiKey });
    if (run?.id) {
      await db
        .from("ai_runs")
        .update({ status: "ok", output: result.output as never, model: result.model ?? null, tokens_in: result.tokensIn ?? null, tokens_out: result.tokensOut ?? null, completed_at: new Date().toISOString() })
        .eq("id", run.id);
    }
    return NextResponse.json({ ok: true, output: result.output });
  } catch (e) {
    const message = (e as Error).message;
    if (run?.id) await db.from("ai_runs").update({ status: "error", error: message, completed_at: new Date().toISOString() }).eq("id", run.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
