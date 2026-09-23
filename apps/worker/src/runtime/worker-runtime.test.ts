import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerRuntime } from './worker-runtime';
import { WorkerRegistry } from './registry';
import { TestWorker } from '../testing/test-worker';
import { InMemoryLockProvider } from '../base/idempotency';
import { MemoryWorkerMetricsCollector } from '../shared/metrics';

const { MockBullWorker, MockBullQueue, mockBullWorkerInstances } = vi.hoisted(() => {
  const instances: any[] = [];

  class MockBullWorker {
    name: string;
    handler: any;
    options: any;
    closed = false;
    close = vi.fn().mockImplementation(async function (this: MockBullWorker) {
      this.closed = true;
    });

    constructor(queueName: string, handler: any, options: any) {
      this.name = queueName;
      this.handler = handler;
      this.options = options;
      instances.push(this);
    }

    on = vi.fn().mockReturnValue(this);
  }

  class MockBullQueue {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    add = vi.fn().mockResolvedValue({ id: 'mock-job-1' });
    close = vi.fn().mockResolvedValue(undefined);
  }

  return { MockBullWorker, MockBullQueue, mockBullWorkerInstances: instances };
});

vi.mock('bullmq', () => {
  return {
    Worker: MockBullWorker,
    Queue: MockBullQueue,
  };
});

describe('WorkerRuntime Level 2: Registration, Dispatch & Lifecycle', () => {
  let worker: TestWorker;
  let runtime: WorkerRuntime;
  let metrics: MemoryWorkerMetricsCollector;
  let lockProvider: InMemoryLockProvider;
  const mockRedis = {} as any;

  beforeEach(() => {
    worker = new TestWorker();
    metrics = new MemoryWorkerMetricsCollector();
    lockProvider = new InMemoryLockProvider();

    runtime = new WorkerRuntime({
      connection: mockRedis,
      idempotencyProvider: lockProvider,
      metrics,
      concurrencyOverrides: {
        'test-queue': 5,
      },
    });
  });

  it('manages worker registration in WorkerRegistry', () => {
    const registry = runtime.getRegistry();
    expect(registry.has(worker.queueName)).toBe(false);

    runtime.registerWorker(worker);
    expect(registry.has(worker.queueName)).toBe(true);
    expect(registry.get(worker.queueName)).toBe(worker);
    expect(registry.getAll()).toHaveLength(1);

    // Duplicate registration should throw
    expect(() => runtime.registerWorker(worker)).toThrow(
      'Worker already registered for queue: test-queue'
    );
  });

  it('prohibits worker registration after runtime has started', async () => {
    runtime.registerWorker(worker);
    await runtime.start();
    expect(runtime.isRunning()).toBe(true);

    const extraWorker = new TestWorker();
    // Use a different queue name for extraWorker
    Object.defineProperty(extraWorker, 'queueName', { value: 'extra-queue' });

    expect(() => runtime.registerWorker(extraWorker)).toThrow(
      'Cannot register workers after runtime has started.'
    );

    await runtime.stop();
  });

  it('dispatches jobs to registered BaseWorker instances with correlation and options', async () => {
    runtime.registerWorker(worker);
    await runtime.start();

    // Retrieve mocked BullMQ Worker
    const latestWorkerInstance =
      mockBullWorkerInstances[mockBullWorkerInstances.length - 1];

    expect(latestWorkerInstance).toBeDefined();
    expect(latestWorkerInstance.options.concurrency).toBe(5);

    // Simulate BullMQ dispatching a job to the worker handler
    const mockJob = {
      id: 'bullmq-job-101',
      name: 'test-job',
      data: {
        testId: 'dispatch-test-1',
        expectedOutcome: 'SUCCESS',
        payloadValue: 'verified-payload',
        jobCorrelationId: 'corr-999',
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
      updateProgress: vi.fn(),
    };

    const result = await latestWorkerInstance.handler(mockJob);

    expect(result.status).toBe('SUCCEEDED');
    expect(result.value.value).toBe('verified-payload');
    expect(result.value.testId).toBe('dispatch-test-1');
    expect(worker.executionCount).toBe(1);

    await runtime.stop();
    expect(runtime.isRunning()).toBe(false);
    expect(latestWorkerInstance.close).toHaveBeenCalled();
  });

  it('drains active workers and sets isRunning to false on stop()', async () => {
    runtime.registerWorker(worker);
    await runtime.start();
    expect(runtime.isRunning()).toBe(true);

    await runtime.stop();
    expect(runtime.isRunning()).toBe(false);
  });
});
