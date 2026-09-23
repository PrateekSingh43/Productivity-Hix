/**
 * Domain Event Envelope Validation Schema
 */

import { z } from 'zod';

export const domainEventEnvelopeSchema = z.object({
  id: z.string().min(1, 'Event id is required'),
  eventType: z.string().min(1, 'eventType is required'),
  aggregateType: z.string().min(1, 'aggregateType is required'),
  aggregateId: z.string().min(1, 'aggregateId is required'),
  payload: z.unknown(),
  correlationId: z.string().min(1, 'correlationId is required'),
  causationId: z.string().optional(),
  version: z.string().min(1, 'version is required'),
  occurredAt: z.string().min(1, 'occurredAt is required'),
});

export function validateDomainEventEnvelope<T = unknown>(raw: unknown) {
  const result = domainEventEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid domain event envelope: ${result.error.issues.map((i) => i.message).join(', ')}`);
  }
  return result.data as z.infer<typeof domainEventEnvelopeSchema> & { payload: T };
}
