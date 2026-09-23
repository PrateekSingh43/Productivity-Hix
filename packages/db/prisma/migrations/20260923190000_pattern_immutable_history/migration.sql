-- Immutable analytical history: runs are never reused across executions,
-- findings belong permanently to the run that generated them.

-- DropUnique (replaced by non-unique lookup index below)
DROP INDEX "pattern_analysis_runs_user_id_identity_key_key";

-- CreateIndex
CREATE INDEX "pattern_analysis_runs_user_id_identity_key_idx" ON "pattern_analysis_runs"("user_id", "identity_key");

-- DropUnique (replaced by run-scoped uniqueness below)
DROP INDEX "pattern_findings_user_id_pattern_key_key";

-- CreateUnique (runId, patternKey): a finding belongs to exactly one run
CREATE UNIQUE INDEX "pattern_findings_run_id_pattern_key_key" ON "pattern_findings"("run_id", "pattern_key");

-- CreateIndex (per-user audit queries)
CREATE INDEX "pattern_findings_user_id_idx" ON "pattern_findings"("user_id");
