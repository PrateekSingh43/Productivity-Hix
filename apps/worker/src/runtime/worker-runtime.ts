/**
 * Worker Runtime Layer
 * 
 * Owns:
 * - BullMQ Worker creation and lifecycle
 * - Job dispatching to registered BaseWorker implementations
 * - Concurrency limits and queue prefixing
 * - Graceful process shutdown (drain in-flight jobs, close listeners)
 */

import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { BaseWorker } from '../base/worker';
import { WorkerRegistry } from './registry';
import { RedisLockProvider, type IdempotencyProvider } from '../base/idempotency';
import {
  type WorkerMetricsCollector,
  noopMetricsCollector,
} from '../shared/metrics';

export interface WorkerRuntimeOptions {
  connection: Redis;
  idempotencyProvider?: IdempotencyProvider;
  metrics?: WorkerMetricsCollector;
  prefix?: string;
  concurrencyOverrides?: Record<string, number>;
}

export class WorkerRuntime {
  private readonly registry = new WorkerRegistry();
  private readonly workers = new Map<string, Worker>();
  private readonly idempotencyProvider: IdempotencyProvider;
  private readonly metrics: WorkerMetricsCollector;
  private isShuttingDown = false;
  private isStarted = false;

  constructor(private readonly options: WorkerRuntimeOptions) {
    this.metrics = options.metrics ?? noopMetricsCollector;
    this.idempotencyProvider =
      options.idempotencyProvider ?? new RedisLockProvider(options.connection);
  }

  getRegistry(): WorkerRegistry {
    return this.registry;
  }

  registerWorker(worker: BaseWorker<any, any>): void {
    if (this.isStarted) {
      throw new Error('Cannot register workers after runtime has started.');
    }
    this.registry.register(worker);
  }

  async start(): Promise<void> {
    if (this.isStarted) return;
    this.isStarted = true;
    this.isShuttingDown = false;

    const registeredWorkers = this.registry.getAll();

    for (const baseWorker of registeredWorkers) {
      const queueName = baseWorker.queueName;
      const concurrency =
        this.options.concurrencyOverrides?.[queueName] ?? 2;

      const bullWorker = new Worker(
        queueName,
        async (job: Job) => {
          if (this.isShuttingDown) {
            throw new Error(`Worker runtime is shutting down. Rejecting job ${job.id}`);
          }

          const correlationId =
            (job.data && typeof job.data === 'object' && 'jobCorrelationId' in job.data
              ? String(job.data.jobCorrelationId)
              : undefined) ?? job.id ?? 'untracked';

          return await baseWorker.run(job.data, {
            jobId: job.id ?? `${queueName}:${Date.now()}`,
            correlationId,
            attempt: job.attemptsMade + 1,
            maxAttempts: job.opts.attempts ?? 3,
            idempotencyProvider: this.idempotencyProvider,
            metrics: this.metrics,
            onProgress: async (progress: number, message?: string) => {
              await job.updateProgress({ progress, message });
            },
          });
        },
        {
          connection: this.options.connection as any,
          prefix: this.options.prefix ?? 'productivehix',
          concurrency,
        }
      );

      bullWorker.on('error', (err) => {
        console.error(`[WorkerRuntime] Worker error on queue ${queueName}:`, err);
      });

      bullWorker.on('failed', (job, err) => {
        console.warn(`[WorkerRuntime] Job ${job?.id} failed on queue ${queueName}:`, err.message);
      });

      this.workers.set(queueName, bullWorker);
    }
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    // Gracefully close all BullMQ workers (stops accepting new jobs, awaits in-flight jobs)
    const closePromises = Array.from(this.workers.values()).map(async (worker) => {
      try {
        await worker.close();
      } catch (err) {
        console.error(`[WorkerRuntime] Error closing worker on queue ${worker.name}:`, err);
      }
    });

    await Promise.all(closePromises);
    this.workers.clear();
    this.isStarted = false;
  }

  isRunning(): boolean {
    return this.isStarted && !this.isShuttingDown;
  }
}
