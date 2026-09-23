-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "MaterializationStatus" AS ENUM ('NO_DATA', 'STALE', 'MATERIALIZING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "causation_id" TEXT,
    "schema_version" TEXT NOT NULL DEFAULT '1.0.0',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "publication_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_by" TEXT,
    "claim_expires_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_day_states" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "local_date" TEXT NOT NULL,
    "current_observation_revision" INTEGER NOT NULL DEFAULT 0,
    "materialized_observation_revision" INTEGER NOT NULL DEFAULT 0,
    "current_rule_revision" INTEGER NOT NULL DEFAULT 0,
    "materialized_rule_revision" INTEGER NOT NULL DEFAULT 0,
    "semantic_version" TEXT NOT NULL DEFAULT '3b.0.1',
    "active_snapshot_id" TEXT,
    "status" "MaterializationStatus" NOT NULL DEFAULT 'NO_DATA',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "last_materialized_at" TIMESTAMP(3),
    "last_attempted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timeline_day_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_claimed_by_claim_expires_at_idx" ON "outbox_events"("claimed_by", "claim_expires_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "outbox_events_event_type_idx" ON "outbox_events"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_day_states_user_id_local_date_key" ON "timeline_day_states"("user_id", "local_date");

-- CreateIndex
CREATE INDEX "timeline_day_states_user_id_status_idx" ON "timeline_day_states"("user_id", "status");

-- AddForeignKey
ALTER TABLE "timeline_day_states" ADD CONSTRAINT "timeline_day_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
