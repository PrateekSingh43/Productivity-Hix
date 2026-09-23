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
  maxRetries?: number;
  scheduledFor?: Date;
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
  return await tx.outboxEvent.create({
    data: {
      eventType: params.eventType,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      payload: params.payload as Prisma.InputJsonValue,
      maxRetries: params.maxRetries ?? 5,
      scheduledFor: params.scheduledFor ?? new Date(),
      status: 'PENDING',
    },
  });
}
