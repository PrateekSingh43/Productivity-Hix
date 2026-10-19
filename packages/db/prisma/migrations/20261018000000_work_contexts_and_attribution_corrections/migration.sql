-- Phase 1 Task Attribution: WorkContext + AttributionCorrection persistence.
--
-- Hand-written and idempotent (IF NOT EXISTS / guarded DO blocks) so that
-- re-applying against any already-migrated database converges instead of
-- failing. Statement order mirrors the repository convention: tables, then
-- constraints, then indexes, then RLS.
--
-- Design notes:
-- 1. At most ONE open work context per user is enforced by a PARTIAL UNIQUE
--    INDEX on (user_id) WHERE ended_at IS NULL. Prisma's schema language
--    cannot express partial unique indexes, so this invariant lives here only
--    (documented on the model). Concurrent openers race on this index and
--    surface as P2002, which the API maps to 409.
-- 2. AttributionCorrection is strictly append-only. Application code never
--    issues UPDATE/DELETE; supersedes_correction_id is a backward pointer set
--    at INSERT time (self-FK, ON DELETE SET NULL so user/task deletion keeps
--    the audit trail).
-- 3. RLS: new tables follow the 20260928000000_enable_rls_and_harden_grants
--    posture (RLS enabled, service_role full-access policy; table owner
--    bypasses RLS, application and worker connect as owner). The later
--    insights migration intentionally skipped this; for these tables we keep
--    the stronger posture. The policy is guarded against duplicate_object.
-- 4. Destructive direct-access privileges (TRUNCATE/REFERENCES/TRIGGER) are
--    revoked from anon/authenticated like 20260928000000 did for its tables.
--    That migration's REVOKE only covered tables existing at the time, and
--    Supabase default privileges can grant them on newly created tables, so
--    repeat it here. Guarded: vanilla PostgreSQL has no anon/authenticated.

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "work_contexts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "task_id" TEXT,
  "goal_id" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "started_by_session_id" TEXT,
  "ended_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_contexts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "attribution_corrections" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "window_start" TIMESTAMP(3) NOT NULL,
  "window_end" TIMESTAMP(3) NOT NULL,
  "target_kind" TEXT NOT NULL,
  "task_id" TEXT,
  "task_title_snapshot" TEXT,
  "reason" VARCHAR(500),
  "supersedes_correction_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attribution_corrections_pkey" PRIMARY KEY ("id")
);

-- ----------------------------------------------------------------------------
-- 2. Foreign keys (PostgreSQL lacks ADD CONSTRAINT IF NOT EXISTS)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE "work_contexts"
    ADD CONSTRAINT "work_contexts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_contexts"
    ADD CONSTRAINT "work_contexts_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_contexts"
    ADD CONSTRAINT "work_contexts_goal_id_fkey"
    FOREIGN KEY ("goal_id") REFERENCES "daily_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "work_contexts"
    ADD CONSTRAINT "work_contexts_started_by_session_id_fkey"
    FOREIGN KEY ("started_by_session_id") REFERENCES "work_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "attribution_corrections"
    ADD CONSTRAINT "attribution_corrections_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "attribution_corrections"
    ADD CONSTRAINT "attribution_corrections_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "attribution_corrections"
    ADD CONSTRAINT "attribution_corrections_supersedes_correction_id_fkey"
    FOREIGN KEY ("supersedes_correction_id") REFERENCES "attribution_corrections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 3. Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "work_contexts_user_id_started_at_idx"
  ON "work_contexts"("user_id", "started_at");

CREATE INDEX IF NOT EXISTS "work_contexts_user_id_ended_at_idx"
  ON "work_contexts"("user_id", "ended_at");

-- The one-open-context-per-user invariant (see header note 1).
CREATE UNIQUE INDEX IF NOT EXISTS "work_contexts_one_open_per_user_key"
  ON "work_contexts"("user_id")
  WHERE "ended_at" IS NULL;

CREATE INDEX IF NOT EXISTS "attribution_corrections_user_id_window_start_window_end_idx"
  ON "attribution_corrections"("user_id", "window_start", "window_end");

CREATE INDEX IF NOT EXISTS "attribution_corrections_user_id_created_at_idx"
  ON "attribution_corrections"("user_id", "created_at");

-- ----------------------------------------------------------------------------
-- 4. RLS (same posture as 20260928000000_enable_rls_and_harden_grants)
-- ----------------------------------------------------------------------------
ALTER TABLE "public"."work_contexts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."attribution_corrections" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access" ON "public"."work_contexts"
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_full_access" ON "public"."attribution_corrections"
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 5. Revoke destructive direct-access privileges (mirror of 20260928000000;
--    TRUNCATE/REFERENCES/TRIGGER bypass or sidestep RLS, so nothing that
--    connects as anon/authenticated should hold them).
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON "public"."work_contexts" FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON "public"."attribution_corrections" FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
