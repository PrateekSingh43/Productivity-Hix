/**
 * Domain Event Envelope & Trigger Validation Schemas
 */

import { z } from 'zod';

export const domainEventEnvelopeSchema = z.object({
  id: z.string().min(1, 'Event id is required'),
  eventType: z.string().min(1, 'eventType is required'),
  aggregateType: z.string().min(1, 'aggregateType is required'),
  aggregateId: z.string().min(1, 'aggregateId is required'),
  payload: z.unknown(),
  correlationId: z.string().min(1, 'correlationId is required'),
  causationId: z.string().nullable().optional(),
  schemaVersion: z.string().min(1, 'schemaVersion is required'),
  occurredAt: z.string().min(1, 'occurredAt is required'),
});

export const timelineTriggerPayloadSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'localDate must be YYYY-MM-DD'),
  sourceRevision: z.number().int().nonnegative(),
  scope: z.object({
    start: z.string().min(1, 'scope.start is required'),
    end: z.string().min(1, 'scope.end is required'),
  }),
  reason: z.enum(['telemetry_ingested', 'rule_changed', 'manual_reprocess']),
  ruleRevision: z.number().int().nonnegative(),
});

export type TimelineTriggerPayloadInput = z.infer<typeof timelineTriggerPayloadSchema>;

export function validateDomainEventEnvelope<T = unknown>(raw: unknown) {
  const result = domainEventEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid domain event envelope: ${result.error.issues.map((i) => i.message).join(', ')}`);
  }
  return result.data as z.infer<typeof domainEventEnvelopeSchema> & { payload: T };
}
