/**
 * Real Integration Verification: Group 2 Queue + Event Infrastructure
 * 
 * Verifies real PostgreSQL transactions, concurrency, and real Upstash Redis:
 * 1. PostgreSQL migration existence.
 * 2. Real transaction: domain mutation + outbox commit atomically.
 * 3. Transaction rollback: neither survives on failure.
 * 4. Concurrent publisher claims: disjoint rows via PostgreSQL concurrency.
 * 5. Real BullMQ duplicate job identity deduplication on Upstash Redis.
 * 6. Publisher crash recovery: expired leases returned to PENDING.
 * 7. Outbox publication retry and dead-letter state.
 * 8. Worker bootstrap and graceful shutdown.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';
import { getDb, disconnectDb } from '@repo/db';
import { createRedisConnection, checkRedisHealth, closeRedisConnection } from '../runtime/redis';
import { QueueManager, createDeterministicJobId } from '../runtime/queue';
import { OutboxPublisher } from '../outbox/publisher';
import { createOutboxEventTx } from '../outbox/storage';
import { getDeadLetterEvents, retryDeadLetterEvent } from '../outbox/dead-letter';
import { WorkerRuntime } from '../runtime/worker-runtime';
import { PRODUCTIVEHIX_QUEUES } from '@repo/types';

// Load env
dotenv.config();
dotenv.config({ path: resolve(__dirname, '../../.env') });
dotenv.config({ path: resolve(__dirname, '../../../packages/db/.env') });

const prisma = getDb();

async function runRealIntegrationSuite() {
  console.log('===============================================================');
  console.log('Starting Real Group 2 PostgreSQL + BullMQ Integration Suite...');
  console.log('===============================================================');

  const testRunId = `run-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const testUserId = `test-user-${testRunId}`;
  const testLocalDate = '2026-09-23';

  // --------------------------------------------------------------------------
  // Item 1: PostgreSQL migration exists on disk
  // --------------------------------------------------------------------------
  console.log('\n[Item 1] Verifying PostgreSQL migration exists...');
  const migrationPath = resolve(
    __dirname,
    '../../../packages/db/prisma/migrations/20260923180000_group2_outbox_and_timeline_day_state/migration.sql'
  );
  if (!existsSync(migrationPath)) {
    throw new Error(`Migration file not found at: ${migrationPath}`);
  }
  const migrationSql = readFileSync(migrationPath, 'utf8');
  if (!migrationSql.includes('outbox_events') || !migrationSql.includes('timeline_day_states')) {
    throw new Error('Migration file does not contain required tables DDL');
  }
  console.log('[Item 1] PASSED: PostgreSQL migration exists and contains canonical DDL.');

  // Create baseline test user in real PostgreSQL
  await prisma.user.create({
    data: {
      id: testUserId,
      displayName: `Integration Tester ${testRunId}`,
    },
  });

  try {
    // ------------------------------------------------------------------------
    // Item 2: Real transaction: domain mutation + outbox commit atomically
    // ------------------------------------------------------------------------
    console.log('\n[Item 2] Verifying atomic transaction commit in real PostgreSQL...');
    const eventId2 = `ev-atomic-${testRunId}`;

    await prisma.$transaction(async (tx) => {
      // 1. Domain mutation (TimelineDayState)
      await tx.timelineDayState.upsert({
        where: { userId_localDate: { userId: testUserId, localDate: testLocalDate } },
        create: {
          userId: testUserId,
          localDate: testLocalDate,
          currentObservationRevision: 1,
          status: 'STALE',
        },
        update: {
          currentObservationRevision: { increment: 1 },
          status: 'STALE',
        },
      });

      // 2. Transactional Outbox Event
      await createOutboxEventTx(tx, {
        eventType: 'telemetry.ingested',
        aggregateType: 'user',
        aggregateId: testUserId,
        payload: {
          userId: testUserId,
          localDate: testLocalDate,
          sourceRevision: 1,
          scope: { start: '2026-09-23T09:00:00Z', end: '2026-09-23T10:00:00Z' },
          reason: 'telemetry_ingested',
          ruleRevision: 0,
        },
        correlationId: `corr-${testRunId}`,
      });
    });

    const dayState2 = await prisma.timelineDayState.findUnique({
      where: { userId_localDate: { userId: testUserId, localDate: testLocalDate } },
    });
    const outbox2 = await prisma.outboxEvent.findFirst({
      where: { aggregateId: testUserId, eventType: 'telemetry.ingested' },
    });

    if (!dayState2 || dayState2.currentObservationRevision !== 1) {
      throw new Error('Item 2 Failed: TimelineDayState was not atomically persisted.');
    }
    if (!outbox2 || outbox2.status !== 'PENDING') {
      throw new Error('Item 2 Failed: OutboxEvent was not atomically persisted in PENDING state.');
    }
    console.log('[Item 2] PASSED: Domain mutation and OutboxEvent committed atomically.');

    // ------------------------------------------------------------------------
    // Item 3: Transaction rollback: neither survives
    // ------------------------------------------------------------------------
    console.log('\n[Item 3] Verifying transaction rollback in real PostgreSQL...');
    const rollbackEventId = `ev-rollback-${testRunId}`;
    let rollbackThrew = false;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.timelineDayState.update({
          where: { userId_localDate: { userId: testUserId, localDate: testLocalDate } },
          data: { currentObservationRevision: 999 },
        });

        await tx.outboxEvent.create({
          data: {
            id: rollbackEventId,
            eventType: 'telemetry.ingested',
            aggregateType: 'user',
            aggregateId: testUserId,
            payload: { canary: true },
            correlationId: `corr-rollback-${testRunId}`,
            status: 'PENDING',
          },
        });

        throw new Error('Intentional constraint trigger - abort transaction');
      });
    } catch {
      rollbackThrew = true;
    }

    if (!rollbackThrew) {
      throw new Error('Item 3 Failed: Transaction did not throw error as expected.');
    }

    const dayStateAfterRollback = await prisma.timelineDayState.findUnique({
      where: { userId_localDate: { userId: testUserId, localDate: testLocalDate } },
    });
    const outboxAfterRollback = await prisma.outboxEvent.findUnique({
      where: { id: rollbackEventId },
    });

    if (dayStateAfterRollback?.currentObservationRevision === 999) {
      throw new Error('Item 3 Failed: TimelineDayState update survived transaction rollback!');
    }
    if (outboxAfterRollback !== null) {
      throw new Error('Item 3 Failed: OutboxEvent survived transaction rollback!');
    }
    console.log('[Item 3] PASSED: Transaction rollback cleanly discarded both mutation and outbox record.');

    // ------------------------------------------------------------------------
    // Item 4: Concurrent publisher claims: disjoint rows
    // ------------------------------------------------------------------------
    console.log('\n[Item 4] Verifying concurrent publisher claiming on real PostgreSQL...');
    const batchEventIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const id = `ev-concurrent-${testRunId}-${i}`;
      batchEventIds.push(id);
      await prisma.outboxEvent.create({
        data: {
          id,
          eventType: 'telemetry.ingested',
          aggregateType: 'user',
          aggregateId: testUserId,
          payload: { index: i },
          correlationId: `corr-concurrent-${i}`,
          status: 'PENDING',
        },
      });
    }

    const redis = createRedisConnection();
    const queueManager = new QueueManager({ connection: redis });

    const pubA = new OutboxPublisher({
      publisherId: `pub-A-${testRunId}`,
      db: prisma,
      queueManager,
    });
    const pubB = new OutboxPublisher({
      publisherId: `pub-B-${testRunId}`,
      db: prisma,
      queueManager,
    });

    // Run concurrent claims
    const [claimedA, claimedB] = await Promise.all([
      pubA.claimPendingEvents(3),
      pubB.claimPendingEvents(3),
    ]);

    const idsA = new Set(claimedA.map((r) => r.id));
    for (const rowB of claimedB) {
      if (idsA.has(rowB.id)) {
        throw new Error(`Concurrency violation! Event ${rowB.id} was claimed by both pubA and pubB.`);
      }
    }

    // Verify claimed rows in database
    const claimedRowsDb = await prisma.outboxEvent.findMany({
      where: { id: { in: batchEventIds } },
    });

    for (const r of claimedRowsDb) {
      if (r.status === 'PROCESSING') {
        if (!r.claimedBy || !r.claimExpiresAt) {
          throw new Error(`Item 4 Failed: Event ${r.id} in PROCESSING lacks claimedBy or claimExpiresAt`);
        }
      }
    }
    console.log(`[Item 4] PASSED: Publisher A claimed ${claimedA.length}, Publisher B claimed ${claimedB.length} with ZERO overlap.`);

    // ------------------------------------------------------------------------
    // Item 5: Real BullMQ duplicate job identity behavior on Upstash Redis
    // ------------------------------------------------------------------------
    console.log('\n[Item 5] Verifying deterministic JobId deduplication on Upstash Redis...');
    const testQueueName = `test-dedupe-${testRunId}`;
    const testJobId = createDeterministicJobId(testQueueName, `entity-${testRunId}`);

    const q = queueManager.getQueue(testQueueName);
    const job1 = await q.add('dedupe.test', { step: 1 }, { jobId: testJobId });
    const job2 = await q.add('dedupe.test', { step: 2 }, { jobId: testJobId });

    if (job1.id !== testJobId || job2.id !== testJobId) {
      throw new Error(`Item 5 Failed: Expected jobId ${testJobId}, got ${job1.id} and ${job2.id}`);
    }

    const jobCount = await q.getJobCountByTypes('waiting', 'delayed', 'active');
    if (jobCount !== 1) {
      throw new Error(`Item 5 Failed: BullMQ queue contains ${jobCount} jobs instead of exactly 1 deduplicated job.`);
    }
    console.log('[Item 5] PASSED: Real BullMQ on Upstash Redis enforces deterministic JobId deduplication.');

    // ------------------------------------------------------------------------
    // Item 6: Publisher crash / recovery
    // ------------------------------------------------------------------------
    console.log('\n[Item 6] Verifying publisher crash recovery in real PostgreSQL...');
    const crashEventId = `ev-crash-${testRunId}`;
    await prisma.outboxEvent.create({
      data: {
        id: crashEventId,
        eventType: 'telemetry.ingested',
        aggregateType: 'user',
        aggregateId: testUserId,
        payload: { crash: true },
        correlationId: `corr-crash-${testRunId}`,
        status: 'PROCESSING',
        claimedBy: 'crashed-worker-host',
        claimExpiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
      },
    });

    const reclaimPub = new OutboxPublisher({
      db: prisma,
      queueManager,
      lockTimeoutMs: 1000,
    });

    const reclaimed = await reclaimPub.reclaimStaleProcessing();
    if (reclaimed < 1) {
      throw new Error('Item 6 Failed: reclaimStaleProcessing did not reclaim expired event.');
    }

    const reclaimedEvent = await prisma.outboxEvent.findUnique({
      where: { id: crashEventId },
    });
    if (!reclaimedEvent || reclaimedEvent.status !== 'PENDING' || reclaimedEvent.claimedBy !== null) {
      throw new Error('Item 6 Failed: Reclaimed event not in PENDING state or claimedBy not null.');
    }
    console.log('[Item 6] PASSED: Crash recovery reset expired processing row back to PENDING.');

    // ------------------------------------------------------------------------
    // Item 7: Outbox publication retry / dead-letter
    // ------------------------------------------------------------------------
    console.log('\n[Item 7] Verifying publication retry exhaustion and dead-letter state...');
    const deadEventId = `ev-dead-${testRunId}`;
    const deadEvent = await prisma.outboxEvent.create({
      data: {
        id: deadEventId,
        eventType: 'unregistered.event.type', // Will fail queue resolution
        aggregateType: 'user',
        aggregateId: testUserId,
        payload: { invalid: true },
        correlationId: `corr-dead-${testRunId}`,
        status: 'PROCESSING',
        publicationAttemptCount: 4,
        maxAttempts: 5,
      },
    });

    await reclaimPub.dispatchEvent(deadEvent);

    const deadEventDb = await prisma.outboxEvent.findUnique({
      where: { id: deadEventId },
    });
    if (!deadEventDb || deadEventDb.status !== 'DEAD_LETTER') {
      throw new Error(`Item 7 Failed: Expected status DEAD_LETTER, got ${deadEventDb?.status}`);
    }
    if (!deadEventDb.lastError?.includes('No canonical queue registered')) {
      throw new Error(`Item 7 Failed: Expected lastError to describe missing queue, got: ${deadEventDb.lastError}`);
    }

    // Test recovery utility
    await retryDeadLetterEvent(prisma, deadEventId);
    const recoveredEvent = await prisma.outboxEvent.findUnique({
      where: { id: deadEventId },
    });
    if (!recoveredEvent || recoveredEvent.status !== 'PENDING' || recoveredEvent.publicationAttemptCount !== 0) {
      throw new Error('Item 7 Failed: retryDeadLetterEvent did not reset event to PENDING with 0 attempts.');
    }
    console.log('[Item 7] PASSED: Publication failure transitioned to DEAD_LETTER and manual retry restored to PENDING.');

    // ------------------------------------------------------------------------
    // Item 8: Worker bootstrap / shutdown
    // ------------------------------------------------------------------------
    console.log('\n[Item 8] Verifying worker bootstrap and clean shutdown...');
    const runtime = new WorkerRuntime({ connection: redis });
    const bootstrapPub = new OutboxPublisher({
      db: prisma,
      queueManager,
      pollIntervalMs: 500,
    });

    await runtime.start();
    bootstrapPub.start();
    if (!bootstrapPub.isPublisherRunning()) {
      throw new Error('Item 8 Failed: Publisher failed to start in bootstrap.');
    }

    // Graceful teardown
    await bootstrapPub.stop();
    await runtime.stop();
    await queueManager.closeAll();
    await closeRedisConnection(redis);

    if (bootstrapPub.isPublisherRunning()) {
      throw new Error('Item 8 Failed: Publisher did not stop gracefully.');
    }
    console.log('[Item 8] PASSED: Worker bootstrap started and cleanly shut down all services.');

    console.log('\n===============================================================');
    console.log('ALL 8 REAL INTEGRATION REQUIREMENTS VERIFIED 100% SUCCESSFULLY!');
    console.log('===============================================================');
  } finally {
    // Clean up test data from real PostgreSQL
    try {
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: testUserId },
      });
      await prisma.timelineDayState.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.user.delete({
        where: { id: testUserId },
      });
      await disconnectDb();
    } catch {
      // Ignore cleanup error
    }
  }
}

runRealIntegrationSuite().catch((err) => {
  console.error('\nREAL INTEGRATION VERIFICATION FAILED:', err);
  process.exit(1);
});
