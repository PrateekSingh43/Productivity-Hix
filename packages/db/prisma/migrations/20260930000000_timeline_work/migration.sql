-- Phase 2 coalescing: one durable work row per (user, day) instead of one
-- outbox row per sync batch. Idempotent apply (IF NOT EXISTS) so re-deploy
-- and fresh databases converge to the same shape.
CREATE TABLE IF NOT EXISTS "timeline_work" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "local_date" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requested_observation_revision" INTEGER NOT NULL DEFAULT 0,
  "requested_rule_revision" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_by" TEXT,
  "claim_expires_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "timeline_work_user_id_local_date_key"
  ON "timeline_work"("user_id", "local_date");
CREATE INDEX IF NOT EXISTS "timeline_work_status_available_at_idx"
  ON "timeline_work"("status", "available_at");
