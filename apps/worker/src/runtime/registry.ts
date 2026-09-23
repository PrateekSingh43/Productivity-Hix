/**
 * Worker Registry
 * Maps queue names to BaseWorker instances.
 */

import type { BaseWorker } from '../base/worker';

export class WorkerRegistry {
  private readonly workers = new Map<string, BaseWorker<any, any>>();

  register(worker: BaseWorker<any, any>): void {
    if (this.workers.has(worker.queueName)) {
      throw new Error(`Worker already registered for queue: ${worker.queueName}`);
    }
    this.workers.set(worker.queueName, worker);
  }

  get(queueName: string): BaseWorker<any, any> | undefined {
    return this.workers.get(queueName);
  }

  has(queueName: string): boolean {
    return this.workers.has(queueName);
  }

  getAll(): BaseWorker<any, any>[] {
    return Array.from(this.workers.values());
  }

  clear(): void {
    this.workers.clear();
  }
}
