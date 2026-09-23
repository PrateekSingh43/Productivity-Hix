/**
 * Queue Management for Producer Operations
 */

import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { PRODUCTIVEHIX_QUEUES, type ProductiveHixQueueName } from '@repo/types';

export interface QueueManagerOptions {
  connection: Redis;
  prefix?: string;
  defaultJobOptions?: JobsOptions;
}

export class QueueManager {
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly options: QueueManagerOptions) {}

  getQueue(queueName: string): Queue {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = new Queue(queueName, {
        connection: this.options.connection as any,
        prefix: this.options.prefix ?? 'productivehix',
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 500,
          ...this.options.defaultJobOptions,
        },
      });
      this.queues.set(queueName, queue);
    }
    return queue;
  }

  async addJob<T>(
    queueName: string,
    jobName: string,
    data: T,
    opts?: JobsOptions
  ): Promise<string> {
    const queue = this.getQueue(queueName);
    const job = await queue.add(jobName, data, opts);
    return job.id ?? jobName;
  }

  async closeAll(): Promise<void> {
    const closing = Array.from(this.queues.values()).map((q) => q.close());
    await Promise.all(closing);
    this.queues.clear();
  }
}
