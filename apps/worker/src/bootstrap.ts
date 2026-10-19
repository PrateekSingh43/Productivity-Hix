/**
 * Worker Application Executable Bootstrap (Redis-free)
 *
 * Initializes the Postgres-direct dispatcher: claims timeline_work rows and
 * outbox events, executes them via TimelineWorker / PatternWorker through
 * the shared BaseWorker.run engine. No Redis, no BullMQ — Postgres rows
 * are the queue, so the free-tier managed-Redis limit is irrelevant.
 */

import 'dotenv/config';
import { getDb, disconnectDb } from '@repo/db';
import { OutboxPublisher } from './outbox/publisher';
import { MemoryWorkerMetricsCollector } from './shared/metrics';
import { createConsoleWorkerLogger } from './shared/logging';

export interface BootstrapResult {
  publisher: OutboxPublisher;
  metrics: MemoryWorkerMetricsCollector;
  shutdown: (signal?: string) => Promise<void>;
}

export async function bootstrap(): Promise<BootstrapResult> {
  console.log('[WorkerBootstrap] Initializing ProductiveHix Postgres-direct worker (no Redis)...');

  // Metrics & durable dispatch (Postgres work-table + outbox, direct execution)
  const metrics = new MemoryWorkerMetricsCollector();
  const db = getDb();
  const publisher = new OutboxPublisher({
    db,
    metrics,
    logger: createConsoleWorkerLogger('OutboxPublisher'),
    pollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 500),
    batchSize: Number(process.env.OUTBOX_BATCH_SIZE ?? 25),
  });

  publisher.start();
  console.log('[WorkerBootstrap] Publisher started: timeline_work + outbox → direct worker execution.');

  let isTerminating = false;

  const handleTermination = async (signal: string = 'SIGTERM') => {
    if (isTerminating) return;
    isTerminating = true;

    console.log(`[WorkerBootstrap] Received ${signal}. Initiating graceful shutdown...`);
    const shutdownTimeout = setTimeout(() => {
      console.error('[WorkerBootstrap] Graceful shutdown timed out after 15s. Forcing exit.');
      process.exit(1);
    }, 15_000);

    try {
      // 1. Stop intake from Postgres
      await publisher.stop();
      console.log('[WorkerBootstrap] Publisher stopped.');

      // 2. Disconnect database
      await disconnectDb();
      console.log('[WorkerBootstrap] Database connection closed.');

      clearTimeout(shutdownTimeout);
      console.log('[WorkerBootstrap] Graceful shutdown completed. Exiting.');
    } catch (err) {
      clearTimeout(shutdownTimeout);
      console.error('[WorkerBootstrap] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleTermination('SIGTERM'));
  process.on('SIGINT', () => handleTermination('SIGINT'));

  return {
    publisher,
    metrics,
    shutdown: handleTermination,
  };
}

import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Auto-run if executed directly as entrypoint
const isDirectEntry =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isDirectEntry) {
  bootstrap().catch((err) => {
    console.error('[WorkerBootstrap] Fatal error during startup:', err);
    process.exit(1);
  });
}
