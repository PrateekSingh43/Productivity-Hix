/**
 * Dead-Letter Outbox Diagnostics & Manual Recovery
 */

import type { Database, OutboxEvent } from '@repo/db';

export interface DeadLetterSummary {
  totalDeadLetter: number;
  byEventType: Record<string, number>;
  oldestFailedAt: Date | null;
  newestFailedAt: Date | null;
}

export async function getDeadLetterEvents(
  db: Database,
  limit: number = 50
): Promise<OutboxEvent[]> {
  return await db.outboxEvent.findMany({
    where: { status: 'DEAD_LETTER' },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
}

export async function getDeadLetterSummary(db: Database): Promise<DeadLetterSummary> {
  const events = await db.outboxEvent.findMany({
    where: { status: 'DEAD_LETTER' },
    select: { eventType: true, updatedAt: true },
    orderBy: { updatedAt: 'asc' },
  });

  const byEventType: Record<string, number> = {};
  for (const ev of events) {
    byEventType[ev.eventType] = (byEventType[ev.eventType] ?? 0) + 1;
  }

  return {
    totalDeadLetter: events.length,
    byEventType,
    oldestFailedAt: events[0]?.updatedAt ?? null,
    newestFailedAt: events[events.length - 1]?.updatedAt ?? null,
  };
}

export async function retryDeadLetterEvent(
  db: Database,
  eventId: string
): Promise<OutboxEvent> {
  return await db.outboxEvent.update({
    where: { id: eventId },
    data: {
      status: 'PENDING',
      retryCount: 0,
      scheduledFor: new Date(),
      lastError: null,
      updatedAt: new Date(),
    },
  });
}
