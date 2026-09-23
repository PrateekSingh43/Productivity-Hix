/**
 * Worker Application Executable Bootstrap
 * 
 * Manages deterministic runtime initialization, worker registration,
 * outbox publisher startup, and graceful OS signal shutdown.
 */

import 'dotenv/config';
import { getDb, disconnectDb } from '@repo/db';
import {
  createRedisConnection,
  checkRedisHealth,
  closeRedisConnection,
} from './runtime/redis';
import { QueueManager } from './runtime/queue';
import { WorkerRuntime } from './runtime/worker-runtime';
import { PatternWorker } from './pattern/pattern-worker';
import { OutboxPublisher } from './outbox/publisher';
import { MemoryWorkerMetricsCollector } from './shared/metrics';

export interface BootstrapResult {
  runtime: WorkerRuntime;
  queueManager: QueueManager;
  publisher: OutboxPublisher;
  metrics: MemoryWorkerMetricsCollector;
  shutdown: (signal?: string) => Promise<void>;
}

export async function bootstrap(): Promise<BootstrapResult> {
  console.log('[WorkerBootstrap] Initializing ProductiveHix Dedicated Worker Runtime...');

  // 1. Redis Connection & Health Probe
  const redis = createRedisConnection();
  const health = await checkRedisHealth(redis);
  console.log(`[WorkerBootstrap] Redis status: ${health.status} (${health.latencyMs}ms latency)`);

  if (health.status === 'unhealthy') {
    throw new Error(`Cannot start worker subsystem: Redis connection unhealthy. ${health.error ?? ''}`);
  }

  // 2. Metrics & Queue Infrastructure
  const metrics = new MemoryWorkerMetricsCollector();
  const queueManager = new QueueManager({ connection: redis });

  // 3. Worker Runtime Layer
  const runtime = new WorkerRuntime({
    connection: redis,
    metrics,
  });

  // 4. Outbox Publisher Layer
  const db = getDb();
  const publisher = new OutboxPublisher({
    db,
    queueManager,
    metrics,
    pollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 500),
    batchSize: Number(process.env.OUTBOX_BATCH_SIZE ?? 25),
  });

  // 5. Register domain workers, then start execution in deterministic order
  runtime.registerWorker(new PatternWorker());

  await runtime.start();
  console.log('[WorkerBootstrap] Worker runtime started and listening for jobs.');

  publisher.start();
  console.log('[WorkerBootstrap] Outbox publisher started and polling for events.');

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
      // 1. Stop intake from outbox
      await publisher.stop();
      console.log('[WorkerBootstrap] Outbox publisher stopped.');

      // 2. Drain and stop BullMQ workers
      await runtime.stop();
      console.log('[WorkerBootstrap] Worker runtime stopped.');

      // 3. Close BullMQ queues
      await queueManager.closeAll();
      console.log('[WorkerBootstrap] Queues closed.');

      // 4. Disconnect databases
      await closeRedisConnection(redis);
      await disconnectDb();
      console.log('[WorkerBootstrap] Database and Redis connections closed.');

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
    runtime,
    queueManager,
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
