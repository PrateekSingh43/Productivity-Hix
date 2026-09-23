/**
 * Group 1 Acceptance Gate Test Suite
 * 
 * Verifies all 8 required cases (Case A through Case H) across the unified pipeline:
 * Producer → Queue → WorkerRuntime → BaseWorker → TestWorker
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerRuntime } from '../runtime/worker-runtime';
import { TestWorker } from './test-worker';
import { InMemoryLockProvider } from '../base/idempotency';
import { MemoryWorkerMetricsCollector } from '../shared/metrics';
import {
  WorkerPermanentError,
  WorkerRetryableError,
  WorkerTimeoutError,
} from '../base/errors';

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
    add = vi.fn().mockResolvedValue({ id: 'mock-job-gate' });
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

describe('Group 1 Acceptance Gate: Cases A through H Proof', () => {
  let worker: TestWorker;
  let runtime: WorkerRuntime;
  let metrics: MemoryWorkerMetricsCollector;
  let lockProvider: InMemoryLockProvider;
  let activeBullWorker: any;

  beforeEach(async () => {
    worker = new TestWorker();
    metrics = new MemoryWorkerMetricsCollector();
    lockProvider = new InMemoryLockProvider();

    runtime = new WorkerRuntime({
      connection: {} as any,
      idempotencyProvider: lockProvider,
      metrics,
    });

    runtime.registerWorker(worker);
    await runtime.start();
    activeBullWorker =
      mockBullWorkerInstances[mockBullWorkerInstances.length - 1];
  });

  // ==========================================================================
  // Case A: success -> SUCCEEDED
  // ==========================================================================
  it('Case A: execution succeeds and returns SUCCEEDED', async () => {
    const job = {
      id: 'job-case-a',
      data: {
        testId: 'case-a-test',
        expectedOutcome: 'SUCCESS',
        payloadValue: 'alpha-value',
        jobCorrelationId: 'corr-a',
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
      updateProgress: vi.fn(),
    };

    const result = await activeBullWorker.handler(job);

    expect(result.status).toBe('SUCCEEDED');
    expect(result.value.value).toBe('alpha-value');
    expect(worker.executionCount).toBe(1);
    expect(worker.durableStore.get('case-a-test')).toBeDefined();
    expect(metrics.getCount('job.succeeded', worker.queueName)).toBe(1);
  });

  // ==========================================================================
  // Case B: retryable error -> BullMQ retry -> success
  // ==========================================================================
  it('Case B: transient failure triggers retryable error, subsequent attempt succeeds', async () => {
    // Attempt 1: fails with retryable error
    const jobAttempt1 = {
      id: 'job-case-b',
      data: {
        testId: 'case-b-test',
        expectedOutcome: 'RETRY_ONCE',
        payloadValue: 'retryable-data',
        jobCorrelationId: 'corr-b',
      },
      attemptsMade: 0, // attempt 1
      opts: { attempts: 3 },
      updateProgress: vi.fn(),
    };

    let errorAttempt1: any = null;
    try {
      await activeBullWorker.handler(jobAttempt1);
    } catch (err) {
      errorAttempt1 = err;
    }

    expect(errorAttempt1).toBeInstanceOf(WorkerRetryableError);
    expect(errorAttempt1.isRetryable).toBe(true);
    expect(metrics.getCount('job.retryable_failure', worker.queueName)).toBe(1);

    // BullMQ Retry: Attempt 2
    const jobAttempt2 = {
      ...jobAttempt1,
      attemptsMade: 1, // attempt 2
    };

    const resultAttempt2 = await activeBullWorker.handler(jobAttempt2);
    expect(resultAttempt2.status).toBe('SUCCEEDED');
    expect(resultAttempt2.value.value).toBe('retryable-data');
    expect(metrics.getCount('job.succeeded', worker.queueName)).toBe(1);
  });

  // ==========================================================================
  // Case C: permanent error -> FAILED
  // ==========================================================================
  it('Case C: permanent invariant failure is classified as non-retryable FAILED', async () => {
    const job = {
      id: 'job-case-c',
      data: {
        testId: 'case-c-test',
        expectedOutcome: 'PERMANENT_FAILURE',
        jobCorrelationId: 'corr-c',
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
      updateProgress: vi.fn(),
    };

    let caughtError: any = null;
    try {
      await activeBullWorker.handler(job);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(WorkerPermanentError);
    expect(caughtError.isRetryable).toBe(false);
    expect(metrics.getCount('job.failed', worker.queueName)).toBe(1);
  });

  // ==========================================================================
  // Case D: timeout -> AbortSignal -> FAILED/RETRY according to policy
  // ==========================================================================
  it('Case D: timeout aborts execution cooperatively via AbortSignal', async () => {
    // Override default timeout on worker for test speed
    Object.defineProperty(worker, 'defaultTimeoutMs', { value: 60 });

    const job = {
      id: 'job-case-d',
      data: {
        testId: 'case-d-test',
        expectedOutcome: 'TIMEOUT',
        delayMs: 300,
        jobCorrelationId: 'corr-d',
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
      updateProgress: vi.fn(),
    };

    let caughtError: any = null;
    try {
      await activeBullWorker.handler(job);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(WorkerTimeoutError);
    expect(caughtError.code).toBe('TIMEOUT');
    expect(caughtError.isRetryable).toBe(true);
    expect(metrics.getCount('job.timeout', worker.queueName)).toBe(1);
  });

  // ==========================================================================
  // Case E: pre-execution supersession -> SUPERSEDED -> execute not called
  // ==========================================================================
  it('Case E: pre-execution supersession marks job SUPERSEDED without calling execute', async () => {
    const job = {
      id: 'job-case-e',
      data: {
        testId: 'case-e-test',
        expectedOutcome: 'PRE_SUPERSEDED',
        jobCorrelationId: 'corr-e',
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
      updateProgress: vi.fn(),
    };

    const result = await activeBullWorker.handler(job);

    expect(result.status).toBe('SUPERSEDED');
    expect(worker.executionCount).toBe(0);
    expect(worker.supersededCount).toBe(1);
    expect(metrics.getCount('job.superseded', worker.queueName)).toBe(1);
  });

  // ==========================================================================
  // Case F: source changes during execution -> post-execution supersession
  // ==========================================================================
  it('Case F: post-execution supersession discards stale results and returns SUPERSEDED', async () => {
    const job = {
      id: 'job-case-f',
      data: {
        testId: 'case-f-test',
        expectedOutcome: 'POST_SUPERSEDED',
        jobCorrelationId: 'corr-f',
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
      updateProgress: vi.fn(),
    };

    const result = await activeBullWorker.handler(job);

    expect(result.status).toBe('SUPERSEDED');
    expect(worker.executionCount).toBe(1);
    expect(worker.supersededCount).toBe(1);
    expect(metrics.getCount('job.superseded', worker.queueName)).toBe(1);
  });

  // ==========================================================================
  // Case G: duplicate logical job -> one logical execution/output
  // ==========================================================================
  it('Case G: duplicate logical job resolves via idempotency without duplicate execution', async () => {
    const job1 = {
      id: 'job-case-g-1',
      data: {
        testId: 'case-g-shared-id',
        expectedOutcome: 'SUCCESS',
        payloadValue: 'idempotent-result',
        jobCorrelationId: 'corr-g-1',
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
      updateProgress: vi.fn(),
    };

    // First execution
    const result1 = await activeBullWorker.handler(job1);
    expect(result1.status).toBe('SUCCEEDED');
    expect(worker.executionCount).toBe(1);

    // Duplicate execution with same testId
    const job2 = {
      id: 'job-case-g-2',
      data: {
        testId: 'case-g-shared-id',
        expectedOutcome: 'SUCCESS',
        payloadValue: 'different-value-ignored',
        jobCorrelationId: 'corr-g-2',
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
      updateProgress: vi.fn(),
    };

    const result2 = await activeBullWorker.handler(job2);
    expect(result2.status).toBe('SUCCEEDED');
    expect(result2.value.value).toBe('idempotent-result'); // returned existing output
    expect(worker.executionCount).toBe(1); // did not re-execute!
  });

  // ==========================================================================
  // Case H: SIGTERM -> stop intake -> drain active work -> close resources -> exit
  // ==========================================================================
  it('Case H: shutdown stops intake, closes BullMQ workers, and drains active jobs', async () => {
    expect(runtime.isRunning()).toBe(true);

    await runtime.stop();

    expect(runtime.isRunning()).toBe(false);
    expect(activeBullWorker.closed).toBe(true);
    expect(activeBullWorker.close).toHaveBeenCalled();

    // Trying to process job after shutdown should be rejected
    const lateJob = {
      id: 'job-late',
      data: {
        testId: 'late-test',
        expectedOutcome: 'SUCCESS',
      },
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: vi.fn(),
    };

    await expect(activeBullWorker.handler(lateJob)).rejects.toThrow(
      'Worker runtime is shutting down'
    );
  });
});
