/**
 * Phase 0 Frozen Worker & Queue Architecture Contracts
 * Canonical Domain Types for BullMQ Job Payloads, Queue Identifiers, and Worker Lifecycle.
 * 
 * Inviolable Principles:
 * 1. Background computation belongs in the worker system, never in the synchronous Timeline request path.
 * 2. Dedicated single worker application (`apps/worker`) hosting domain-specific processors.
 * 3. PostgreSQL is the authoritative source of truth; Redis/BullMQ is purely for transient queueing/scheduling.
 * 4. Job uniqueness is scoped to `userId + localDate` (prevents uncontrolled duplicate jobs).
 * 5. Materialization for the same user/day MUST be serialized; different users/days can run concurrently.
 * 6. The worker must re-verify the database revision upon execution before publishing.
 */

// ============================================================================
// 1. Canonical Queue Names
// ============================================================================

export const PRODUCTIVEHIX_QUEUES = {
  TIMELINE_MATERIALIZATION: 'timeline-materialization',
  PATTERN_ANALYSIS: 'pattern-analysis',
  INSIGHT_GENERATION: 'insight-generation',
} as const;

export type ProductiveHixQueueName =
  (typeof PRODUCTIVEHIX_QUEUES)[keyof typeof PRODUCTIVEHIX_QUEUES];

// ============================================================================
// 2. Job Payload Contracts
// ============================================================================

export interface TimelineMaterializationJobData {
  userId: string;
  localDate: string; // "YYYY-MM-DD"
  reason: 'TELEMETRY_INGEST' | 'RULE_CHANGE' | 'GAP_EXPLANATION' | 'MANUAL_REPAIR' | 'COLD_START';
  requestedRevision: {
    observationRevision: number;
    ruleRevision: number;
    semanticVersion: string;
  };
  options?: {
    forceRebuild?: boolean;
    priority?: number;
    maxBreakMs?: number;
  };
  jobCorrelationId: string;
  queuedAt: string;
}

export interface PatternAnalysisJobData {
  userId: string;
  windowStart: string; // ISO timestamp
  windowEnd: string;   // ISO timestamp
  targetDetectors?: string[];
  reason: 'SCHEDULED_CADENCE' | 'MANUAL_TRIGGER' | 'SIGNIFICANT_TELEMETRY_CHANGE';
  jobCorrelationId: string;
  queuedAt: string;
}

export interface InsightGenerationJobData {
  userId: string;
  localDate: string; // "YYYY-MM-DD"
  scope: 'DAILY_SYNTHESIS' | 'RECALL_DUE' | 'BEHAVIORAL_NUDGE';
  jobCorrelationId: string;
  queuedAt: string;
}

// ============================================================================
// 3. Worker Concurrency & Lock Contracts
// ============================================================================

/**
 * Standardized job key generator ensuring single active job per user+day
 */
export function getTimelineJobKey(userId: string, localDate: string): string {
  return `${userId}:${localDate}`;
}

export interface WorkerJobResult {
  success: boolean;
  jobCorrelationId: string;
  userId: string;
  localDate?: string;
  snapshotId?: string;
  snapshotGeneration?: number;
  durationMs: number;
  error?: {
    code: string;
    message: string;
    stack?: string;
    isRetryable: boolean;
  };
}

export interface WorkerRetryPolicy {
  maxAttempts: number;
  backoffType: 'exponential' | 'fixed';
  baseDelayMs: number;
}

export const DEFAULT_TIMELINE_RETRY_POLICY: WorkerRetryPolicy = {
  maxAttempts: 3,
  backoffType: 'exponential',
  baseDelayMs: 2000,
};
