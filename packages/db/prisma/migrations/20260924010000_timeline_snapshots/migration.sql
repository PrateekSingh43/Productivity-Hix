-- CreateTable
CREATE TABLE "timeline_snapshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "local_date" TEXT NOT NULL,
    "day_state_id" TEXT,
    "snapshot_generation" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'COMPLETE',
    "observation_revision" INTEGER NOT NULL DEFAULT 0,
    "rule_revision" INTEGER NOT NULL DEFAULT 0,
    "semantic_engine_version" TEXT NOT NULL DEFAULT '3b.0.1',
    "summary" JSONB NOT NULL,
    "blocks_json" JSONB NOT NULL,
    "gaps_json" JSONB NOT NULL DEFAULT '[]',
    "block_count" INTEGER NOT NULL DEFAULT 0,
    "gap_count" INTEGER NOT NULL DEFAULT 0,
    "start_of_day" TIMESTAMP(3) NOT NULL,
    "end_of_day" TIMESTAMP(3) NOT NULL,
    "wall_clock_duration_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observed_active_duration_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quiet_activity_duration_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prolonged_absence_duration_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "machine_unavailable_duration_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "coverage_gap_duration_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "materialized_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timeline_snapshots_user_id_local_date_idx" ON "timeline_snapshots"("user_id", "local_date");

-- CreateIndex
CREATE INDEX "timeline_snapshots_day_state_id_idx" ON "timeline_snapshots"("day_state_id");

-- AddForeignKey
ALTER TABLE "timeline_snapshots" ADD CONSTRAINT "timeline_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_snapshots" ADD CONSTRAINT "timeline_snapshots_day_state_id_fkey" FOREIGN KEY ("day_state_id") REFERENCES "timeline_day_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_day_states" ADD CONSTRAINT "timeline_day_states_active_snapshot_id_fkey" FOREIGN KEY ("active_snapshot_id") REFERENCES "timeline_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
