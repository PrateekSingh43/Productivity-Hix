-- RLS hardening for the public schema (zero-data-loss, zero-breakage).
--
-- Rationale (verified 2026-09-28, see git history for evidence):
-- 1. The Express API + worker connect as the `postgres` role, which OWNS all
--    37 public tables. Table owners bypass RLS (FORCE RLS is deliberately NOT
--    used here), so enabling RLS cannot change API behavior.
-- 2. This app does NOT use Supabase Auth: auth.users is empty, API auth is a
--    custom device-token scheme, and public.users.id values are app-issued
--    CUIDs/UUIDs, never auth.uid(). Ownership policies of the form
--    `user_id = auth.uid()` would therefore be both wrong and inert, so they
--    are intentionally absent. If Supabase Auth is ever adopted, add a
--    users.auth_id uuid column, backfill it, then add ownership policies.
-- 3. anon/authenticated held TRIGGER + TRUNCATE (+REFERENCES) on every table:
--    no SELECT/INSERT/UPDATE/DELETE, so data could not be read via PostgREST,
--    but TRUNCATE/TRIGGER are destructive/escalation primitives for any party
--    holding a direct connection. Nothing connects as anon/authenticated
--    (no Supabase client keys exist in the repo), so revoking is breakage-free.
-- 4. service_role is left untouched and given an explicit full-access policy:
--    it is the server-side convention role (secret-held, same trust tier as
--    DATABASE_URL) and must keep working if ever used.
-- 5. With RLS enabled and no policies for anon/authenticated, direct
--    PostgREST access defaults to deny. All access flows through the API,
--    which enforces per-user scoping in application code
--    (requireAuth + userId-scoped Prisma queries).

-- 1. Enable RLS on every public table (idempotent; owner bypasses, so the
-- API is unaffected). FORCE RLS is NOT set on purpose.
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."activity_context_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."activity_sync_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."attention_inferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."block_observations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."browser_installations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."check_ins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."claim_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."daily_goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."daily_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."desktop_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."device_authorizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."device_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."learning_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."learning_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."learning_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."normalized_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."oauth_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pattern_analysis_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pattern_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."proposed_device_heartbeats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."semantic_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."task_schedule_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."telemetry_coverage_gaps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."temporal_activity_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."timeline_day_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."timeline_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_activity_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_activity_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_gap_explanations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."work_sessions" ENABLE ROW LEVEL SECURITY;

-- 2. Revoke destructive direct-access privileges. Nothing connects as these
-- roles (verified: no Supabase client keys in the repo), so this is
-- breakage-free. service_role intentionally untouched (see header).
REVOKE TRIGGER, TRUNCATE, REFERENCES ON ALL TABLES IN SCHEMA "public" FROM anon, authenticated;

-- 3. Explicit full-access policy for the server-side convention role.
-- Declarative (service_role holds no DML grants today, so behavior is
-- unchanged); documents the intended server path and satisfies policy audits.
CREATE POLICY "service_role_full_access" ON "public"."_prisma_migrations" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."activity_context_links" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."activity_sync_states" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."ai_conversations" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."ai_messages" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."attention_inferences" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."block_observations" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."browser_installations" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."check_ins" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."claim_evidence" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."daily_goals" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."daily_plans" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."desktop_devices" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."device_authorizations" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."device_tokens" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."learning_answers" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."learning_assessments" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."learning_questions" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."normalized_activity" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."oauth_accounts" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."outbox_events" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."pattern_analysis_runs" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."pattern_findings" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."proposed_device_heartbeats" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."semantic_claims" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."task_schedule_history" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."tasks" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."telemetry_coverage_gaps" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."temporal_activity_blocks" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."timeline_day_states" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."timeline_snapshots" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."user_activity_overrides" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."user_activity_rules" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."user_gap_explanations" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."user_preferences" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."users" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON "public"."work_sessions" FOR ALL TO service_role USING (true) WITH CHECK (true);
