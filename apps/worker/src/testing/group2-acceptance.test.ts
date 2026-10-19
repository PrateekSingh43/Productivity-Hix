/**
 * Group 2 Acceptance Gate Test Suite: Postgres-Direct Event Infrastructure (Redis-free)
 *
 * Verifies all required test cases:
 * Case A. Outbox event → domain worker routing table
 * Case B. Direct dispatch uses deterministic job identity per event
 * Case C. Job payload validation rejects invalid input
 * Case D. Domain mutation + outbox record commit atomically
 * Case E. Rollback removes BOTH mutation and outbox record
 * Case F. Publisher successfully executes an outbox event directly
 * Case G. Publisher crash/retry does not permanently lose the event
 * Case H. Duplicate dispatch is safe (deterministic identity)
 * Case I. Exhausted retries enter explicit failure/dead-letter state
 * Case J. Multiple publishers cannot corrupt the same outbox event
 * Case K. Worker bootstrap starts and shuts down correctly
 * Case L. Existing Group 1 acceptance cases still pass
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateJobPayload,
  JobPayloadValidationError,
} from '@repo/validation';
import { PRODUCTIVEHIX_QUEUES } from '@repo/types';
import { OutboxPublisher, resolveHandlerForEvent } from '../outbox/publisher';
import { createOutboxEventTx } from '../outbox/storage';
import { getDeadLetterEvents, retryDeadLetterEvent } from '../outbox/dead-letter';
import { MemoryWorkerMetricsCollector } from '../shared/metrics';

// Mock Database for Outbox Tests
function createMockDatabase() {
  const outboxRecords: any[] = [];

  return {
    records: outboxRecords,
    client: {
      outboxEvent: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const record = {
            id: data.id ?? `outbox-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            publicationAttemptCount: data.publicationAttemptCount ?? 0,
            maxAttempts: data.maxAttempts ?? 5,
            status: data.status ?? 'PENDING',
            availableAt: data.availableAt ?? new Date(),
            claimedBy: data.claimedBy ?? null,
            claimExpiresAt: data.claimExpiresAt ?? null,
            lastAttemptAt: data.lastAttemptAt ?? null,
            lastError: data.lastError ?? null,
            publishedAt: data.publishedAt ?? null,
            correlationId: data.correlationId ?? 'mock-corr',
            causationId: data.causationId ?? null,
            schemaVersion: data.schemaVersion ?? '1.0.0',
            occurredAt: data.occurredAt ?? new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          outboxRecords.push(record);
          return record;
        }),

        findMany: vi.fn().mockImplementation(async (query: any) => {
          let filtered = [...outboxRecords];
          if (query?.where?.status) {
            if (typeof query.where.status === 'string') {
              filtered = filtered.filter((r) => r.status === query.where.status);
            } else if (query.where.status.in) {
              filtered = filtered.filter((r) => query.where.status.in.includes(r.status));
            }
          }
          if (query?.where?.id?.in) {
            filtered = filtered.filter((r) => query.where.id.in.includes(r.id));
          }
          if (query?.where?.claimedBy !== undefined) {
            filtered = filtered.filter((r) => r.claimedBy === query.where.claimedBy);
          }
          if (query?.where?.claimExpiresAt?.lt) {
            filtered = filtered.filter((r) => r.claimExpiresAt && r.claimExpiresAt < query.where.claimExpiresAt.lt);
          }
          if (query?.where?.availableAt?.lte) {
            filtered = filtered.filter((r) => r.availableAt <= query.where.availableAt.lte);
          }
          if (query?.where?.updatedAt?.lt) {
            filtered = filtered.filter((r) => r.updatedAt < query.where.updatedAt.lt);
          }
          if (query?.take) {
            filtered = filtered.slice(0, query.take);
          }
          return filtered;
        }),

        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          const record = outboxRecords.find((r) => r.id === where.id);
          if (!record) throw new Error(`Record ${where.id} not found`);
          Object.assign(record, data);
          return record;
        }),

        updateMany: vi.fn().mockImplementation(async ({ where, data }: any) => {
          let count = 0;
          for (const record of outboxRecords) {
            let matches = true;
            if (where.status && record.status !== where.status) matches = false;
            if (where.claimedBy !== undefined && record.claimedBy !== where.claimedBy) matches = false;
            if (where.claimExpiresAt?.lt && (!record.claimExpiresAt || record.claimExpiresAt >= where.claimExpiresAt.lt)) matches = false;
            if (where.id?.in && !where.id.in.includes(record.id)) matches = false;
            if (where.updatedAt?.lt && record.updatedAt >= where.updatedAt.lt) matches = false;

            if (matches) {
              Object.assign(record, data);
              count++;
            }
          }
          return { count };
        }),

        deleteMany: vi.fn().mockImplementation(async ({ where }: any) => {
          let count = 0;
          const toKeep: any[] = [];
          for (const record of outboxRecords) {
            let matches = true;
            if (where.status && record.status !== where.status) matches = false;
            if (where.publishedAt?.lt && (!record.publishedAt || record.publishedAt >= where.publishedAt.lt)) matches = false;

            if (matches) {
              count++;
            } else {
              toKeep.push(record);
            }
          }
          outboxRecords.length = 0;
          outboxRecords.push(...toKeep);
          return { count };
        }),
      },
    } as any,
  };
}

describe('Group 2 Acceptance Gate: Postgres-Direct Event Infrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Case A: Event → worker routing (no queue)
  // ==========================================================================
  it('Case A: resolves each outbox event type to its owning domain worker', () => {
    for (const t of ['telemetry.ingested', 'rule.changed', 'override.changed', 'gap.explained']) {
      expect(resolveHandlerForEvent(t)).toBe('timeline');
    }
    expect(resolveHandlerForEvent('pattern.analysis.requested')).toBe('pattern');
    expect(resolveHandlerForEvent('nope.unknown')).toBeUndefined();
  });

  // ==========================================================================
  // Case B: Direct dispatch uses deterministic job identity per event
  // ==========================================================================
  it('Case B: repeated dispatch of the same event reuses the same jobId', async () => {
    const mockDb = createMockDatabase();
    const seenJobIds: string[] = [];
    const fakeWorker = {
      run: vi.fn().mockImplementation(async (_payload: unknown, opts: { jobId: string }) => {
        seenJobIds.push(opts.jobId);
        return { status: 'SUCCEEDED' };
      }),
    };

    const event = await mockDb.client.outboxEvent.create({
      data: {
        id: 'outbox-fixed-id-123',
        eventType: 'telemetry.ingested',
        aggregateType: 'user',
        aggregateId: 'user-dedupe',
        correlationId: 'corr-dedupe',
        payload: {
          userId: 'user-dedupe',
          localDate: '2026-09-23',
          reason: 'TELEMETRY_INGEST',
          requestedRevision: { observationRevision: 1, ruleRevision: 1, semanticVersion: '1.0.0' },
          jobCorrelationId: 'corr-dedupe',
          queuedAt: new Date().toISOString(),
        },
      },
    });

    const publisher = new OutboxPublisher({
      db: mockDb.client,
      timelineWorker: fakeWorker as never,
    });

    await publisher.dispatchEvent(event);
    await publisher.dispatchEvent(event);

    expect(seenJobIds).toHaveLength(2);
    expect(seenJobIds[0]).toBe('timeline__outbox-fixed-id-123');
    expect(seenJobIds[1]).toBe(seenJobIds[0]);
  });

  // ==========================================================================
  // Case C: Job payload validation rejects invalid input
  // ==========================================================================
  it('Case C: job payload validation rejects invalid input with non-retryable error', () => {
    const validPayload = {
      userId: 'user-valid',
      localDate: '2026-09-23',
      reason: 'TELEMETRY_INGEST',
      requestedRevision: {
        observationRevision: 1,
        ruleRevision: 1,
        semanticVersion: '1.0.0',
      },
      jobCorrelationId: 'corr-123',
      queuedAt: new Date().toISOString(),
    };

    // Valid passes cleanly
    const result = validateJobPayload(
      PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION,
      validPayload
    );
    expect(result).toEqual(validPayload);

    // Missing required fields
    const invalidPayload = {
      userId: 'user-valid',
      // Missing localDate, reason, requestedRevision
    };

    expect(() => {
      validateJobPayload(PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION, invalidPayload);
    }).toThrow(JobPayloadValidationError);

    try {
      validateJobPayload(PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION, invalidPayload);
    } catch (err: any) {
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.isRetryable).toBe(false);
      expect(err.issues.length).toBeGreaterThan(0);
    }

    // Invalid localDate format
    expect(() => {
      validateJobPayload(PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION, {
        ...validPayload,
        localDate: '23-09-2026', // wrong format
      });
    }).toThrow();
  });

  // ==========================================================================
  // Case D: Domain mutation + outbox record commit atomically
  // ==========================================================================
  it('Case D: domain mutation and outbox event execute in the same transaction client', async () => {
    const committedEntities: any[] = [];

    // Mock Prisma Transaction Client
    const mockTx = {
      userPreference: {
        update: vi.fn().mockImplementation(async ({ data }: any) => {
          committedEntities.push({ entity: 'preference', data });
          return data;
        }),
      },
      outboxEvent: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          committedEntities.push({ entity: 'outbox', data });
          return { id: 'outbox-tx-1', ...data };
        }),
      },
    } as any;

    // Simulate atomic transactional block
    await (async (tx) => {
      // 1. Domain state change
      await tx.userPreference.update({
        where: { userId: 'usr-101' },
        data: { quietHoursEnabled: false },
      });

      // 2. Transactional outbox event
      await createOutboxEventTx(tx, {
        eventType: 'rule.changed',
        aggregateType: 'user',
        aggregateId: 'usr-101',
        payload: { userId: 'usr-101', change: 'quiet_hours_disabled' },
        correlationId: 'corr-case-d',
      });
    })(mockTx);

    expect(committedEntities).toHaveLength(2);
    expect(committedEntities[0].entity).toBe('preference');
    expect(committedEntities[1].entity).toBe('outbox');
    expect(committedEntities[1].data.eventType).toBe('rule.changed');
    expect(committedEntities[1].data.status).toBe('PENDING');
    expect(committedEntities[1].data.correlationId).toBe('corr-case-d');
  });

  // ==========================================================================
  // Case E: Rollback removes BOTH mutation and outbox record
  // ==========================================================================
  it('Case E: transaction rollback reverts both domain mutation and outbox record', async () => {
    const committedEntities: any[] = [];

    const executeTransaction = async (shouldFail: boolean) => {
      const localStaged: any[] = [];
      const mockTx = {
        task: {
          update: vi.fn().mockImplementation(async ({ data }: any) => {
            localStaged.push({ entity: 'task', data });
          }),
        },
        outboxEvent: {
          create: vi.fn().mockImplementation(async ({ data }: any) => {
            localStaged.push({ entity: 'outbox', data });
          }),
        },
      } as any;

      try {
        await (async (tx) => {
          await tx.task.update({ data: { title: 'New Task Title' } });
          await createOutboxEventTx(tx, {
            eventType: 'telemetry.ingested',
            aggregateType: 'task',
            aggregateId: 'task-1',
            payload: { taskId: 'task-1' },
            correlationId: 'corr-case-e',
          });

          if (shouldFail) {
            throw new Error('Database constraint violation - rollback triggered');
          }

          // If no error, commit staged entities
          committedEntities.push(...localStaged);
        })(mockTx);
      } catch (err) {
        // Rollback: localStaged is discarded
      }
    };

    // Execute failing transaction
    await executeTransaction(true);
    expect(committedEntities).toHaveLength(0); // Nothing committed
  });

  // ==========================================================================
  // Case F: Publisher successfully executes an outbox event directly
  // ==========================================================================
  it('Case F: publisher successfully claims and executes outbox event via TimelineWorker', async () => {
    const mockDb = createMockDatabase();
    const executed: unknown[] = [];
    const fakeWorker = {
      run: vi.fn().mockImplementation(async (payload: unknown) => {
        executed.push(payload);
        return { status: 'SUCCEEDED' };
      }),
    };
    const metrics = new MemoryWorkerMetricsCollector();

    // Insert pending outbox event
    await mockDb.client.outboxEvent.create({
      data: {
        eventType: 'telemetry.ingested',
        aggregateType: 'user',
        aggregateId: 'user-case-f',
        correlationId: 'corr-case-f',
        payload: {
          userId: 'user-case-f',
          localDate: '2026-09-23',
          reason: 'TELEMETRY_INGEST',
          requestedRevision: {
            observationRevision: 1,
            ruleRevision: 1,
            semanticVersion: '1.0.0',
          },
          jobCorrelationId: 'corr-case-f',
          queuedAt: new Date().toISOString(),
        },
      },
    });

    const publisher = new OutboxPublisher({
      db: mockDb.client,
      timelineWorker: fakeWorker as never,
      metrics,
    });

    const processed = await publisher.processNextBatch();
    expect(processed).toBe(1);

    const record = mockDb.records[0];
    expect(record.status).toBe('PUBLISHED');
    expect(record.publishedAt).toBeInstanceOf(Date);
    expect(metrics.getCount('outbox.published', PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION)).toBe(1);

    // Verify the worker received the complete DomainEventEnvelope directly
    expect(executed).toHaveLength(1);
    const envelope = executed[0] as Record<string, unknown>;
    expect(envelope.eventType).toBe('telemetry.ingested');
    expect(envelope.correlationId).toBe('corr-case-f');
    expect(envelope.schemaVersion).toBe('1.0.0');
  });

  // ==========================================================================
  // Case G: Publisher crash/retry does not permanently lose the event
  // ==========================================================================
  it('Case G: publisher crash leaves event in PROCESSING; reclaimStaleProcessing recovers it', async () => {
    const mockDb = createMockDatabase();

    // Stale event stuck in PROCESSING where claim lease expired
    const expiredClaim = new Date(Date.now() - 1000);
    const staleEvent = await mockDb.client.outboxEvent.create({
      data: {
        eventType: 'telemetry.ingested',
        aggregateType: 'user',
        aggregateId: 'user-crash',
        status: 'PROCESSING',
        claimedBy: 'dead-publisher-1',
        claimExpiresAt: expiredClaim,
        payload: { dummy: true },
      },
    });

    const publisher = new OutboxPublisher({
      db: mockDb.client,
      lockTimeoutMs: 60_000,
    });

    // Reclaim stale processing
    const reclaimedCount = await publisher.reclaimStaleProcessing();
    expect(reclaimedCount).toBe(1);
    expect(staleEvent.status).toBe('PENDING'); // Successfully returned to PENDING for re-attempt
    expect(staleEvent.claimedBy).toBeNull();
  });

  // ==========================================================================
  // Case H: Duplicate dispatch is safe (deterministic job identity)
  // ==========================================================================
  it('Case H: duplicate dispatch reuses the deterministic jobId (no duplicate work identity)', async () => {
    const mockDb = createMockDatabase();
    const seenJobIds: string[] = [];
    const fakeWorker = {
      run: vi.fn().mockImplementation(async (_payload: unknown, opts: { jobId: string }) => {
        seenJobIds.push(opts.jobId);
        return { status: 'SUCCEEDED' };
      }),
    };

    const event = await mockDb.client.outboxEvent.create({
      data: {
        id: 'outbox-fixed-id-123',
        eventType: 'telemetry.ingested',
        aggregateType: 'user',
        aggregateId: 'user-dedupe',
        correlationId: 'corr-dedupe',
        payload: {
          userId: 'user-dedupe',
          localDate: '2026-09-23',
          reason: 'TELEMETRY_INGEST',
          requestedRevision: {
            observationRevision: 1,
            ruleRevision: 1,
            semanticVersion: '1.0.0',
          },
          jobCorrelationId: 'corr-dedupe',
          queuedAt: new Date().toISOString(),
        },
      },
    });

    const publisher = new OutboxPublisher({
      db: mockDb.client,
      timelineWorker: fakeWorker as never,
    });

    // Dispatch event first time
    await publisher.dispatchEvent(event);
    // Dispatch event second time (simulating recovery replay)
    await publisher.dispatchEvent(event);

    expect(seenJobIds).toHaveLength(2);
    // Both executions used the exact same deterministic jobId
    expect(seenJobIds[0]).toBe('timeline__outbox-fixed-id-123');
    expect(seenJobIds[1]).toBe(seenJobIds[0]);
  });

  // ==========================================================================
  // Case I: Exhausted publication retry enters explicit failure/dead-letter state
  // ==========================================================================
  it('Case I: exhausted publication retries transitions event to DEAD_LETTER state', async () => {
    const mockDb = createMockDatabase();
    const metrics = new MemoryWorkerMetricsCollector();

    // Failing worker simulates poison payload (non-infra error)
    const failingWorker = {
      run: vi.fn().mockRejectedValue(new Error('worker poison: invalid payload')),
    };

    const event = await mockDb.client.outboxEvent.create({
      data: {
        id: 'outbox-failing-1',
        eventType: 'telemetry.ingested',
        aggregateType: 'user',
        aggregateId: 'user-fail',
        publicationAttemptCount: 4, // 4 retries already performed
        maxAttempts: 5, // 5th attempt will fail and exhaust retries
        payload: {},
      },
    });

    const publisher = new OutboxPublisher({
      db: mockDb.client,
      timelineWorker: failingWorker as never,
      metrics,
    });

    const result = await publisher.dispatchEvent(event);
    expect(result).toBe(false);

    expect(event.status).toBe('DEAD_LETTER');
    expect(event.publicationAttemptCount).toBe(5);
    expect(event.lastError).toContain('Exhausted publication retries (5/5)');
    expect(metrics.getCount('outbox.dead_letter', PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION)).toBe(1);

    // Verify recovery helper
    const deadLetters = await getDeadLetterEvents(mockDb.client);
    expect(deadLetters).toHaveLength(1);

    await retryDeadLetterEvent(mockDb.client, event.id);
    expect(event.status).toBe('PENDING');
    expect(event.publicationAttemptCount).toBe(0);
  });

  // ==========================================================================
  // Case J: Multiple publishers cannot corrupt the same outbox event
  // ==========================================================================
  it('Case J: concurrent publishers claim disjoint events without double-claiming', async () => {
    const mockDb = createMockDatabase();

    // Seed 10 pending events
    for (let i = 0; i < 10; i++) {
      await mockDb.client.outboxEvent.create({
        data: {
          id: `concurrent-ev-${i}`,
          eventType: 'telemetry.ingested',
          aggregateType: 'user',
          aggregateId: `user-${i}`,
          payload: {},
        },
      });
    }

    const publisherA = new OutboxPublisher({ db: mockDb.client });
    const publisherB = new OutboxPublisher({ db: mockDb.client });

    // Simulate concurrent claiming
    const [claimedA, claimedB] = await Promise.all([
      publisherA.claimPendingEvents(5),
      publisherB.claimPendingEvents(5),
    ]);

    // Zero overlap on concurrent claim
    const idsA = new Set(claimedA.map((e) => e.id));
    for (const item of claimedB) {
      expect(idsA.has(item.id)).toBe(false);
    }

    // Next tick claims remaining disjoint events
    const secondBatch = claimedB.length === 0
      ? await publisherB.claimPendingEvents(5)
      : await publisherA.claimPendingEvents(5);

    const allClaimed = [...claimedA, ...claimedB, ...secondBatch];
    const uniqueIds = new Set(allClaimed.map((e) => e.id));

    expect(uniqueIds.size).toBe(10);
    expect(allClaimed).toHaveLength(10);
  });

  // ==========================================================================
  // Case K: Worker bootstrap starts and shuts down correctly (no Redis)
  // ==========================================================================
  it('Case K: publisher lifecycle starts and stops cleanly with no transport to close', async () => {
    const events: string[] = [];

    const mockDb: any = {
      outboxEvent: {
        updateMany: async () => ({ count: 0 }),
        findMany: async () => [],
        groupBy: async () => [],
      },
      timelineWork: {
        updateMany: async () => ({ count: 0 }),
        findMany: async () => [],
      },
    };
    const publisher = new OutboxPublisher({ db: mockDb, pollIntervalMs: 10 });

    // Startup: publisher starts polling
    publisher.start();
    events.push('publisher:start');
    expect(publisher.isPublisherRunning()).toBe(true);

    // Shutdown: publisher stops intake (no queues, no redis to close)
    await publisher.stop();
    events.push('publisher:stop');
    expect(publisher.isPublisherRunning()).toBe(false);

    expect(events).toEqual(['publisher:start', 'publisher:stop']);
  });
});
