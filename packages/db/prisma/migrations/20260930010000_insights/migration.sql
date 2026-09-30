-- Phase 6: durable insight compositions (previously transient per-GET).
-- Idempotent apply (IF NOT EXISTS) so re-deploy and fresh databases converge.
CREATE TABLE IF NOT EXISTS "insights" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "window_start" TIMESTAMPTZ(6) NOT NULL,
  "window_end" TIMESTAMPTZ(6) NOT NULL,
  "content_hash" TEXT NOT NULL,
  "pattern_ids" TEXT[] NOT NULL,
  "claim" TEXT NOT NULL,
  "claim_level" TEXT NOT NULL,
  "headline" TEXT,
  "supporting_line" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DETECTED',
  "created_from_run_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "insights_user_id_content_hash_key"
  ON "insights"("user_id", "content_hash");
CREATE INDEX IF NOT EXISTS "insights_user_id_window_start_window_end_idx"
  ON "insights"("user_id", "window_start", "window_end");
