# AI features

Empty on purpose. To add a feature:

1. Create `src/lib/ai/features/<name>.ts` exporting an `AiFeature` (see `../index.ts`).
2. Register it in `src/lib/ai/index.ts` (import the file so `registerFeature` runs).
3. Add `@anthropic-ai/sdk` when the first feature needs it, and set `ANTHROPIC_API_KEY` on the server.

Candidates already anticipated by the schema:

- `brief_to_tasks` — turn a project brief / meeting notes into milestones and tasks (`tasks`, `milestones`).
- `weekly_client_summary` — summarise a project's week from `activity_log`, `time_entries` and `content_items`.
