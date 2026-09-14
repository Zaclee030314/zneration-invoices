// AI feature registry. No features ship in v1; this is the seam where they
// plug in later (e.g. "brief_to_tasks", "weekly_client_summary").
//
// A feature receives the caller's Supabase client (RLS applies) and the JSON
// input, and returns a JSON-serialisable result. The route in
// src/app/api/ai/[feature]/route.ts records every run in `ai_runs`.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AiFeatureContext {
  db: SupabaseClient;
  userId: string;
  workspaceId: string;
  apiKey: string;
}

export interface AiFeature<I = unknown, O = unknown> {
  name: string;
  description: string;
  run(input: I, ctx: AiFeatureContext): Promise<{ output: O; model?: string; tokensIn?: number; tokensOut?: number }>;
}

const registry = new Map<string, AiFeature>();

export function registerFeature(feature: AiFeature) {
  registry.set(feature.name, feature);
}

export function getFeature(name: string): AiFeature | undefined {
  return registry.get(name);
}

export function listFeatures(): { name: string; description: string }[] {
  return [...registry.values()].map((f) => ({ name: f.name, description: f.description }));
}
