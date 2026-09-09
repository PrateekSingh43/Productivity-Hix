-- Phase 3A: Semantic Data Architecture Migration
-- Canonical domain model & relational schema from frozen Phase 2 specification

-- CreateEnum
CREATE TYPE "ActivityModality" AS ENUM ('development', 'reading_research', 'writing_documentation', 'communication', 'administration', 'media_consumption', 'gaming', 'idle_away', 'system_maintenance', 'unknown');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('MODALITY_PRIMARY', 'MODALITY_SECONDARY', 'TOPIC_CONTEXT', 'INFERRED_BEHAVIOR');

-- CreateEnum
CREATE TYPE "ClaimProvenance" AS ENUM ('SENSOR_OBSERVED', 'USER_RULE', 'USER_OVERRIDE', 'ACTIVE_SESSION_AFFINITY', 'CONTEXT_HEURISTIC', 'INFERRED');

-- CreateEnum
CREATE TYPE "ClaimAuthority" AS ENUM ('SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "TargetScope" AS ENUM ('TASK', 'GOAL', 'PROJECT', 'GENERAL_WORK', 'UNLINKED');

-- CreateEnum
CREATE TYPE "ContextRelevance" AS ENUM ('DIRECT', 'SUPPORTIVE', 'TANGENTIAL', 'UNRELATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "IntentionRelationship" AS ENUM ('ALIGNED', 'DIVERGENT', 'UNLINKED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FocusEvidenceState" AS ENUM ('UNKNOWN', 'INSUFFICIENT', 'SUPPORTED', 'CONTRADICTORY');

-- CreateEnum
CREATE TYPE "TrackType" AS ENUM ('FOREGROUND', 'AMBIENT_AUDIO', 'BACKGROUND_PROCESS');

-- CreateEnum
CREATE TYPE "CoverageState" AS ENUM ('SYSTEM_SLEEP', 'POWER_OFF', 'COLLECTOR_DISCONNECTED', 'SENSOR_AFK', 'UNKNOWN_SILENCE');

-- CreateEnum
CREATE TYPE "ReconciliationState" AS ENUM ('UNEXPLAINED', 'PENDING_PROMPT', 'EXPLAINED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SourceChannel" AS ENUM ('DESKTOP_WINDOW', 'BROWSER_TAB', 'COORDINATED_DESKTOP_WEB');

-- CreateEnum
CREATE TYPE "MachinePowerState" AS ENUM ('ACTIVE', 'SLEEPING', 'POWERED_OFF', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CollectorState" AS ENUM ('CONNECTED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "InputState" AS ENUM ('ACTIVE', 'AFK');

-- CreateTable
CREATE TABLE "temporal_activity_blocks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID,
    "observation_set_fingerprint" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "wall_clock_duration_ms" INTEGER NOT NULL,
    "observed_active_duration_ms" INTEGER NOT NULL,
    "paused_duration_ms" INTEGER NOT NULL DEFAULT 0,
    "track" "TrackType" NOT NULL DEFAULT 'FOREGROUND',
    "primary_application" TEXT NOT NULL,
    "clean_title" TEXT NOT NULL,
    "domain" TEXT,
    "sanitized_url" TEXT,
    "source_channel" "SourceChannel" NOT NULL DEFAULT 'DESKTOP_WINDOW',
    "raw_event_count" INTEGER NOT NULL DEFAULT 1,
    "interaction_density" JSONB,
    "source_composition" JSONB,
    "semantic_version" TEXT NOT NULL DEFAULT '1.0.0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "temporal_activity_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_observations" (
    "id" UUID NOT NULL,
    "block_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "contribution_start" TIMESTAMP(3) NOT NULL,
    "contribution_end" TIMESTAMP(3) NOT NULL,
    "contribution_duration_ms" INTEGER NOT NULL,

    CONSTRAINT "block_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_claims" (
    "id" UUID NOT NULL,
    "block_id" UUID NOT NULL,
    "claim_type" "ClaimType" NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "provenance" "ClaimProvenance" NOT NULL DEFAULT 'INFERRED',
    "authority" "ClaimAuthority" NOT NULL DEFAULT 'SYSTEM',
    "engine_version" TEXT NOT NULL,
    "rule_set_version" TEXT,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "input_fingerprint" TEXT,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "supersedes_id" UUID,

    CONSTRAINT "semantic_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_evidence" (
    "id" UUID NOT NULL,
    "claim_id" UUID,
    "link_id" UUID,
    "inference_id" UUID,
    "evidence_type" TEXT NOT NULL,
    "evidence_reference" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "claim_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_context_links" (
    "id" UUID NOT NULL,
    "block_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_scope" "TargetScope" NOT NULL DEFAULT 'UNLINKED',
    "task_id" UUID,
    "goal_id" UUID,
    "project_tag" TEXT,
    "relevance" "ContextRelevance" NOT NULL DEFAULT 'UNKNOWN',
    "intention_relationship" "IntentionRelationship" NOT NULL DEFAULT 'UNKNOWN',
    "confidence" DOUBLE PRECISION,
    "provenance" "ClaimProvenance" NOT NULL DEFAULT 'INFERRED',
    "authority" "ClaimAuthority" NOT NULL DEFAULT 'SYSTEM',

    CONSTRAINT "activity_context_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attention_inferences" (
    "id" UUID NOT NULL,
    "block_id" UUID NOT NULL,
    "focus_evidence_state" "FocusEvidenceState" NOT NULL DEFAULT 'UNKNOWN',
    "confidence" DOUBLE PRECISION,
    "provenance" "ClaimProvenance" NOT NULL DEFAULT 'INFERRED',
    "authority" "ClaimAuthority" NOT NULL DEFAULT 'SYSTEM',

    CONSTRAINT "attention_inferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_coverage_gaps" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "coverage_state" "CoverageState" NOT NULL DEFAULT 'UNKNOWN_SILENCE',
    "reconciliation_state" "ReconciliationState" NOT NULL DEFAULT 'UNEXPLAINED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telemetry_coverage_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_gap_explanations" (
    "id" UUID NOT NULL,
    "gap_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "explanation_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "offline_work_context" TEXT,
    "associated_task_id" UUID,
    "associated_goal_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_gap_explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_activity_rules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "application_pattern" TEXT,
    "domain_pattern" TEXT,
    "title_pattern" TEXT,
    "url_pattern" TEXT,
    "assigned_modality" "ActivityModality",
    "assigned_context" TEXT,
    "default_relevance" "ContextRelevance",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_activity_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_activity_overrides" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_time_window_start" TIMESTAMP(3) NOT NULL,
    "target_time_window_end" TIMESTAMP(3) NOT NULL,
    "target_application" TEXT NOT NULL,
    "target_observation_set_fingerprint" TEXT,
    "target_claim_family" TEXT NOT NULL,
    "target_claim_type" TEXT NOT NULL,
    "overridden_value" TEXT NOT NULL,
    "associated_task_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activity_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposed_device_heartbeats" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "machine_power_state" "MachinePowerState" NOT NULL DEFAULT 'ACTIVE',
    "collector_state" "CollectorState" NOT NULL DEFAULT 'CONNECTED',
    "input_state" "InputState" NOT NULL DEFAULT 'ACTIVE',
    "battery_level" DOUBLE PRECISION,

    CONSTRAINT "proposed_device_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "temporal_activity_blocks_user_id_start_time_end_time_idx" ON "temporal_activity_blocks"("user_id", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "temporal_activity_blocks_observation_set_fingerprint_idx" ON "temporal_activity_blocks"("observation_set_fingerprint");

-- CreateIndex
CREATE INDEX "block_observations_activity_id_idx" ON "block_observations"("activity_id");

-- CreateIndex
CREATE UNIQUE INDEX "block_observations_block_id_activity_id_contribution_start_key" ON "block_observations"("block_id", "activity_id", "contribution_start");

-- CreateIndex
CREATE INDEX "semantic_claims_block_id_is_current_idx" ON "semantic_claims"("block_id", "is_current");

-- CreateIndex
CREATE INDEX "semantic_claims_claim_type_value_is_current_idx" ON "semantic_claims"("claim_type", "value", "is_current");

-- CreateIndex
CREATE INDEX "semantic_claims_provenance_idx" ON "semantic_claims"("provenance");

-- CreateIndex
CREATE INDEX "claim_evidence_claim_id_idx" ON "claim_evidence"("claim_id");

-- CreateIndex
CREATE INDEX "claim_evidence_link_id_idx" ON "claim_evidence"("link_id");

-- CreateIndex
CREATE INDEX "claim_evidence_inference_id_idx" ON "claim_evidence"("inference_id");

-- CreateIndex
CREATE INDEX "activity_context_links_block_id_idx" ON "activity_context_links"("block_id");

-- CreateIndex
CREATE INDEX "activity_context_links_user_id_idx" ON "activity_context_links"("user_id");

-- CreateIndex
CREATE INDEX "activity_context_links_task_id_idx" ON "activity_context_links"("task_id");

-- CreateIndex
CREATE INDEX "activity_context_links_goal_id_idx" ON "activity_context_links"("goal_id");

-- CreateIndex
CREATE INDEX "attention_inferences_block_id_idx" ON "attention_inferences"("block_id");

-- CreateIndex
CREATE INDEX "telemetry_coverage_gaps_user_id_start_time_idx" ON "telemetry_coverage_gaps"("user_id", "start_time");

-- CreateIndex
CREATE INDEX "user_gap_explanations_gap_id_idx" ON "user_gap_explanations"("gap_id");

-- CreateIndex
CREATE INDEX "user_gap_explanations_user_id_idx" ON "user_gap_explanations"("user_id");

-- CreateIndex
CREATE INDEX "user_activity_rules_user_id_priority_idx" ON "user_activity_rules"("user_id", "priority");

-- CreateIndex
CREATE INDEX "user_activity_overrides_user_id_target_time_window_start_ta_idx" ON "user_activity_overrides"("user_id", "target_time_window_start", "target_time_window_end");

-- CreateIndex
CREATE INDEX "proposed_device_heartbeats_device_id_timestamp_idx" ON "proposed_device_heartbeats"("device_id", "timestamp");

-- AddForeignKey
ALTER TABLE "temporal_activity_blocks" ADD CONSTRAINT "temporal_activity_blocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporal_activity_blocks" ADD CONSTRAINT "temporal_activity_blocks_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "desktop_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_observations" ADD CONSTRAINT "block_observations_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "temporal_activity_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_observations" ADD CONSTRAINT "block_observations_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "normalized_activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_claims" ADD CONSTRAINT "semantic_claims_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "temporal_activity_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_claims" ADD CONSTRAINT "semantic_claims_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "semantic_claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "semantic_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "activity_context_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_inference_id_fkey" FOREIGN KEY ("inference_id") REFERENCES "attention_inferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_context_links" ADD CONSTRAINT "activity_context_links_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "temporal_activity_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_context_links" ADD CONSTRAINT "activity_context_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_context_links" ADD CONSTRAINT "activity_context_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_context_links" ADD CONSTRAINT "activity_context_links_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "daily_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attention_inferences" ADD CONSTRAINT "attention_inferences_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "temporal_activity_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_coverage_gaps" ADD CONSTRAINT "telemetry_coverage_gaps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_coverage_gaps" ADD CONSTRAINT "telemetry_coverage_gaps_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "desktop_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_gap_explanations" ADD CONSTRAINT "user_gap_explanations_gap_id_fkey" FOREIGN KEY ("gap_id") REFERENCES "telemetry_coverage_gaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_gap_explanations" ADD CONSTRAINT "user_gap_explanations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_gap_explanations" ADD CONSTRAINT "user_gap_explanations_associated_task_id_fkey" FOREIGN KEY ("associated_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_gap_explanations" ADD CONSTRAINT "user_gap_explanations_associated_goal_id_fkey" FOREIGN KEY ("associated_goal_id") REFERENCES "daily_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activity_rules" ADD CONSTRAINT "user_activity_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_activity_overrides" ADD CONSTRAINT "user_activity_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposed_device_heartbeats" ADD CONSTRAINT "proposed_device_heartbeats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposed_device_heartbeats" ADD CONSTRAINT "proposed_device_heartbeats_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "desktop_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Canonical Invariant Constraints & Indexes (Phase 2 & Phase 3A Frozen Spec)
-- ============================================================================

-- 1. ClaimEvidence single-target constraint:
-- Exactly one target must be non-null: claim_id OR link_id OR inference_id
ALTER TABLE "claim_evidence"
ADD CONSTRAINT "chk_claim_evidence_single_target"
CHECK (
  num_nonnulls(claim_id, link_id, inference_id) = 1
);

-- 2. Primary modality uniqueness constraint:
-- Exactly one current MODALITY_PRIMARY claim per TemporalActivityBlock
CREATE UNIQUE INDEX "idx_semantic_claims_primary_modality_current"
ON "semantic_claims"("block_id")
WHERE "claim_type" = 'MODALITY_PRIMARY'
  AND "is_current" = true;

-- 3. Temporal block duration arithmetic integrity:
ALTER TABLE "temporal_activity_blocks"
ADD CONSTRAINT "chk_temporal_blocks_durations"
CHECK (
  "wall_clock_duration_ms" >= 0 AND
  "observed_active_duration_ms" >= 0 AND
  "paused_duration_ms" >= 0 AND
  "observed_active_duration_ms" <= "wall_clock_duration_ms" AND
  "paused_duration_ms" = ("wall_clock_duration_ms" - "observed_active_duration_ms")
);

-- 4. Block observation contribution interval integrity:
ALTER TABLE "block_observations"
ADD CONSTRAINT "chk_block_observations_contribution"
CHECK (
  "contribution_duration_ms" >= 0 AND
  "contribution_start" < "contribution_end"
);

-- 5. Confidence range constraint (null OR 0.0 <= confidence <= 1.0):
ALTER TABLE "semantic_claims"
ADD CONSTRAINT "chk_semantic_claims_confidence"
CHECK ("confidence" IS NULL OR ("confidence" >= 0.0 AND "confidence" <= 1.0));

ALTER TABLE "activity_context_links"
ADD CONSTRAINT "chk_activity_context_links_confidence"
CHECK ("confidence" IS NULL OR ("confidence" >= 0.0 AND "confidence" <= 1.0));

ALTER TABLE "attention_inferences"
ADD CONSTRAINT "chk_attention_inferences_confidence"
CHECK ("confidence" IS NULL OR ("confidence" >= 0.0 AND "confidence" <= 1.0));

-- 6. Coverage gap & explanation interval integrity:
ALTER TABLE "telemetry_coverage_gaps"
ADD CONSTRAINT "chk_telemetry_coverage_gaps_interval"
CHECK ("start_time" < "end_time" AND "duration_seconds" >= 0);

ALTER TABLE "user_gap_explanations"
ADD CONSTRAINT "chk_user_gap_explanations_interval"
CHECK ("start_time" < "end_time");
