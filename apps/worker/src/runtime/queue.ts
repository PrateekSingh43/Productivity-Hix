/**
 * Canonical BullMQ Queue Factory & Management
 * 
 * Provides centralized queue construction, deterministic jobId generation,
 * default retry/backoff policies, and queue observability.
 */

import { Queue, type JobsOptions, type QueueOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { validateJobPayload } from '@repo/validation';

export interface QueueFactoryOptions {
  connection: Redis;
  prefix?: string;
  defaultJobOptions?: JobsOptions;
}

export const CANONICAL_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: {
    count: 1000,
    age: 24 * 3600, // 24 hours
  },
  removeOnFail: {
    count: 5000,
    age: 7 * 24 * 3600, // 7 days
  },
};

/**
 * Creates a BullMQ Queue instance with canonical defaults.
 */
export function createQueue(queueName: string, options: QueueFactoryOptions): Queue {
  const queueOptions: QueueOptions = {
    connection: options.connection as any,
    prefix: options.prefix ?? 'productivehix',
    defaultJobOptions: {
      ...CANONICAL_JOB_OPTIONS,
      ...options.defaultJobOptions,
    },
  };

  return new Queue(queueName, queueOptions);
}

/**
 * Produces deterministic jobId for queue-level deduplication.
 */
export function createDeterministicJobId(queueName: string, uniqueKey: string): string {
  return `${queueName}:${uniqueKey}`;
}

export interface QueueDepth {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  total: number;
}

export class QueueManager {
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly options: QueueFactoryOptions) {}

  getQueue(queueName: string): Queue {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = createQueue(queueName, this.options);
      this.queues.set(queueName, queue);
    }
    return queue;
  }

  /**
   * Enqueues a job into a BullMQ queue with payload validation.
   */
  async addJob<T = unknown>(
    queueName: string,
    jobName: string,
    data: T,
    opts?: JobsOptions
  ): Promise<string> {
    // Validate payload against canonical schema before enqueueing
    validateJobPayload(queueName, data);

    const queue = this.getQueue(queueName);
    const job = await queue.add(jobName, data, opts);
    return job.id ?? jobName;
  }

  /**
   * Retrieves queue depth metrics for monitoring.
   */
  async getQueueDepth(queueName: string): Promise<QueueDepth> {
    const queue = this.getQueue(queueName);
    const [waiting, active, delayed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getDelayedCount(),
      queue.getFailedCount(),
    ]);

    return {
      waiting,
      active,
      delayed,
      failed,
      total: waiting + active + delayed,
    };
  }

  async closeAll(): Promise<void> {
    const closing = Array.from(this.queues.values()).map((q) => q.close());
    await Promise.all(closing);
    this.queues.clear();
  }
}
