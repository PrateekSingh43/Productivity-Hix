/**
 * Outbox Storage Primitives & Transactional Helpers
 * Enforces atomic database mutation + outbox event commit in the same transaction.
 */

import type { Prisma, OutboxEvent } from '@repo/db';

export interface CreateOutboxEventParams<T = unknown> {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: T;
  correlationId: string;
  causationId?: string | null;
  schemaVersion?: string;
  occurredAt?: Date;
  availableAt?: Date;
  maxAttempts?: number;
}

export type PrismaTransactionClient = Prisma.TransactionClient;

/**
 * Creates an outbox event within an existing PostgreSQL transaction.
 * Guarantees that domain state mutation and outbox publication cannot decouple.
 */
export async function createOutboxEventTx<T = unknown>(
  tx: PrismaTransactionClient,
  params: CreateOutboxEventParams<T>
): Promise<OutboxEvent> {
  const now = new Date();
  return await tx.outboxEvent.create({
    data: {
      eventType: params.eventType,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      payload: params.payload as Prisma.InputJsonValue,
      correlationId: params.correlationId,
      causationId: params.causationId ?? null,
      schemaVersion: params.schemaVersion ?? '1.0.0',
      occurredAt: params.occurredAt ?? now,
      status: 'PENDING',
      publicationAttemptCount: 0,
      maxAttempts: params.maxAttempts ?? 5,
      availableAt: params.availableAt ?? now,
      lastError: null,
      claimedBy: null,
      claimExpiresAt: null,
    },
  });
}
