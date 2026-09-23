/**
 * Job Payload Validation Schemas & Boundary Functions
 * Guarantees untrusted job payloads are validated before reaching domain execution.
 */

import { z } from 'zod';
import { PRODUCTIVEHIX_QUEUES } from '@repo/types';

export class JobPayloadValidationError extends Error {
  public readonly code = 'VALIDATION_ERROR';
  public readonly isRetryable = false;

  constructor(
    message: string,
    public readonly issues: z.ZodIssue[] = [],
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'JobPayloadValidationError';
  }
}

export const timelineMaterializationJobDataSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'localDate must be YYYY-MM-DD'),
  reason: z.enum([
    'TELEMETRY_INGEST',
    'RULE_CHANGE',
    'GAP_EXPLANATION',
    'MANUAL_REPAIR',
    'COLD_START',
  ]),
  requestedRevision: z.object({
    observationRevision: z.number().int().nonnegative(),
    ruleRevision: z.number().int().nonnegative(),
    semanticVersion: z.string().min(1),
  }),
  options: z
    .object({
      forceRebuild: z.boolean().optional(),
      priority: z.number().optional(),
      maxBreakMs: z.number().optional(),
    })
    .optional(),
  jobCorrelationId: z.string().min(1, 'jobCorrelationId is required'),
  queuedAt: z.string().min(1, 'queuedAt is required'),
});

export const patternAnalysisJobDataSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  windowStart: z.string().min(1, 'windowStart is required'),
  windowEnd: z.string().min(1, 'windowEnd is required'),
  targetDetectors: z.array(z.string()).optional(),
  reason: z.enum([
    'SCHEDULED_CADENCE',
    'MANUAL_TRIGGER',
    'SIGNIFICANT_TELEMETRY_CHANGE',
  ]),
  jobCorrelationId: z.string().min(1, 'jobCorrelationId is required'),
  queuedAt: z.string().min(1, 'queuedAt is required'),
});

export const insightGenerationJobDataSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'localDate must be YYYY-MM-DD'),
  scope: z.enum(['DAILY_SYNTHESIS', 'RECALL_DUE', 'BEHAVIORAL_NUDGE']),
  jobCorrelationId: z.string().min(1, 'jobCorrelationId is required'),
  queuedAt: z.string().min(1, 'queuedAt is required'),
});

export const queuePayloadSchemas = {
  [PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION]: timelineMaterializationJobDataSchema,
  [PRODUCTIVEHIX_QUEUES.PATTERN_ANALYSIS]: patternAnalysisJobDataSchema,
  [PRODUCTIVEHIX_QUEUES.INSIGHT_GENERATION]: insightGenerationJobDataSchema,
} as const;

/**
 * Validates untrusted job payload according to queue name.
 * Throws non-retryable JobPayloadValidationError on schema violations.
 */
export function validateJobPayload<T = unknown>(queueName: string, raw: unknown): T {
  const schema = (queuePayloadSchemas as Record<string, z.ZodTypeAny | undefined>)[queueName];
  if (!schema) {
    // If not a registered schema (e.g. test queue), verify it is an object
    if (!raw || typeof raw !== 'object') {
      throw new JobPayloadValidationError(`Payload for queue ${queueName} must be a valid non-null object`);
    }
    return raw as T;
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issueSummary = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new JobPayloadValidationError(
      `Job payload validation failed for queue ${queueName}: ${issueSummary}`,
      result.error.issues,
      result.error
    );
  }

  return result.data as T;
}
