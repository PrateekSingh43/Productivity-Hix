-- CreateEnum
CREATE TYPE "PatternRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "pattern_analysis_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "identity_key" TEXT NOT NULL,
    "input_fingerprint" TEXT NOT NULL,
    "status" "PatternRunStatus" NOT NULL DEFAULT 'RUNNING',
    "state" TEXT NOT NULL DEFAULT 'pending',
    "diagnostics_json" JSONB,
    "detector_version" TEXT NOT NULL,
    "config_version" TEXT NOT NULL,
    "job_correlation_id" TEXT,
    "error" TEXT,
    "computed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pattern_analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pattern_findings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "pattern_key" TEXT NOT NULL,
    "detector_identity" TEXT NOT NULL,
    "pattern_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pattern_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pattern_analysis_runs_user_id_identity_key_key" ON "pattern_analysis_runs"("user_id", "identity_key");

-- CreateIndex
CREATE INDEX "pattern_analysis_runs_user_id_window_start_window_end_idx" ON "pattern_analysis_runs"("user_id", "window_start", "window_end");

-- CreateIndex
CREATE UNIQUE INDEX "pattern_findings_user_id_pattern_key_key" ON "pattern_findings"("user_id", "pattern_key");

-- CreateIndex
CREATE INDEX "pattern_findings_run_id_idx" ON "pattern_findings"("run_id");

-- AddForeignKey
ALTER TABLE "pattern_analysis_runs" ADD CONSTRAINT "pattern_analysis_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_findings" ADD CONSTRAINT "pattern_findings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_findings" ADD CONSTRAINT "pattern_findings_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "pattern_analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
