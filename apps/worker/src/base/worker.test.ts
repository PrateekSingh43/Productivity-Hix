import { describe, it, expect, beforeEach } from 'vitest';
import { TestWorker } from '../testing/test-worker';
import { InMemoryLockProvider } from './idempotency';
import { MemoryWorkerMetricsCollector } from '../shared/metrics';
import { MemoryWorkerLogger } from '../shared/logging';
import {
  WorkerValidationError,
  WorkerRetryableError,
  WorkerPermanentError,
  WorkerTimeoutError,
  WorkerCancelledError,
} from './errors';

describe('BaseWorker Level 1: Core Execution Semantics', () => {
  let worker: TestWorker;
  let lockProvider: InMemoryLockProvider;
  let metrics: MemoryWorkerMetricsCollector;
  let logger: MemoryWorkerLogger;

  beforeEach(() => {
    worker = new TestWorker();
    lockProvider = new InMemoryLockProvider();
    metrics = new MemoryWorkerMetricsCollector();
    logger = new MemoryWorkerLogger();
  });

  it('validates raw payload and rejects invalid inputs with WorkerValidationError', async () => {
    await expect(
      worker.run(null, { metrics, logger })
    ).rejects.toThrow(WorkerValidationError);

    await expect(
      worker.run({ testId: 'missing-outcome' }, { metrics, logger })
    ).rejects.toThrow(WorkerValidationError);

    expect(metrics.getCount('job.failed', worker.queueName)).toBe(2);
  });

  it('computes deterministic job identity', () => {
    const data = worker.validate({ testId: 'user-day-123', expectedOutcome: 'SUCCESS' });
    const id1 = worker.getJobIdentity(data);
    const id2 = worker.getJobIdentity(data);
    expect(id1).toBe('test-job:user-day-123');
    expect(id1).toBe(id2);
  });

  it('bypasses execution when durable output already exists (Idempotency)', async () => {
    const result = await worker.run(
      { testId: 'idempotent-test', expectedOutcome: 'IDEMPOTENT_EXISTING' },
      { metrics, logger, idempotencyProvider: lockProvider }
    );

    expect(result.status).toBe('SUCCEEDED');
    if (result.status === 'SUCCEEDED') {
      expect(result.value.value).toBe('pre-existing-idempotent-value');
    }
    expect(worker.executionCount).toBe(0); // execute was NOT called
    expect(metrics.getCount('job.succeeded', worker.queueName)).toBe(1);
  });

  it('executes successfully and persists to durable storage', async () => {
    const result = await worker.run(
      { testId: 'exec-1', expectedOutcome: 'SUCCESS', payloadValue: 'computed-metric' },
      { metrics, logger, idempotencyProvider: lockProvider }
    );

    expect(result.status).toBe('SUCCEEDED');
    if (result.status === 'SUCCEEDED') {
      expect(result.value.value).toBe('computed-metric');
      expect(result.value.testId).toBe('exec-1');
    }
    expect(worker.executionCount).toBe(1);
    expect(worker.durableStore.get('exec-1')).toBeDefined();
    expect(metrics.getCount('job.succeeded', worker.queueName)).toBe(1);
  });

  it('acquires and releases distributed execution locks', async () => {
    // Hold lock manually
    const lockKey = worker.getLockKey(
      worker.validate({ testId: 'lock-test', expectedOutcome: 'SUCCESS' }),
      'test-job:lock-test'
    );
    const handle = await lockProvider.acquire(lockKey, 10_000);
    expect(handle).not.toBeNull();

    // Attempting to run should fail with WorkerRetryableError because lock is held
    await expect(
      worker.run(
        { testId: 'lock-test', expectedOutcome: 'SUCCESS' },
        { metrics, logger, idempotencyProvider: lockProvider }
      )
    ).rejects.toThrow(WorkerRetryableError);

    expect(metrics.getCount('job.retryable_failure', worker.queueName)).toBe(1);

    // Release lock
    if (handle) {
      await lockProvider.release(handle);
    }

    // Now it should acquire lock and succeed
    const result = await worker.run(
      { testId: 'lock-test', expectedOutcome: 'SUCCESS' },
      { metrics, logger, idempotencyProvider: lockProvider }
    );
    expect(result.status).toBe('SUCCEEDED');
  });

  it('skips execution when job is superseded before start (Pre-Execution Supersession)', async () => {
    const result = await worker.run(
      { testId: 'supersede-pre', expectedOutcome: 'PRE_SUPERSEDED' },
      { metrics, logger, idempotencyProvider: lockProvider }
    );

    expect(result.status).toBe('SUPERSEDED');
    expect(worker.executionCount).toBe(0);
    expect(worker.supersededCount).toBe(1);
    expect(metrics.getCount('job.superseded', worker.queueName)).toBe(1);
  });

  it('discards results when source mutates during computation (Post-Execution Supersession)', async () => {
    const result = await worker.run(
      { testId: 'supersede-post', expectedOutcome: 'POST_SUPERSEDED' },
      { metrics, logger, idempotencyProvider: lockProvider }
    );

    expect(result.status).toBe('SUPERSEDED');
    expect(worker.executionCount).toBe(1); // was executed, but discarded
    expect(worker.supersededCount).toBe(1);
    expect(metrics.getCount('job.superseded', worker.queueName)).toBe(1);
  });

  it('enforces cooperative timeout via AbortController and AbortSignal', async () => {
    await expect(
      worker.run(
        { testId: 'timeout-job', expectedOutcome: 'TIMEOUT', delayMs: 500 },
        { timeoutMs: 50, metrics, logger }
      )
    ).rejects.toThrow(WorkerTimeoutError);

    expect(metrics.getCount('job.timeout', worker.queueName)).toBe(1);
  });

  it('respects external cancellation signal', async () => {
    const controller = new AbortController();
    controller.abort('Manual operator cancellation');

    await expect(
      worker.run(
        { testId: 'cancel-job', expectedOutcome: 'SUCCESS' },
        { signal: controller.signal, metrics, logger }
      )
    ).rejects.toThrow(WorkerCancelledError);
  });

  it('normalizes transient retryable errors and unrecoverable permanent errors', async () => {
    // Attempt 1 of retryable error
    await expect(
      worker.run(
        { testId: 'retry-job', expectedOutcome: 'RETRY_ONCE' },
        { attempt: 1, metrics, logger }
      )
    ).rejects.toThrow(WorkerRetryableError);
    expect(metrics.getCount('job.retryable_failure', worker.queueName)).toBe(1);

    // Attempt 2 succeeds
    const successResult = await worker.run(
      { testId: 'retry-job', expectedOutcome: 'RETRY_ONCE' },
      { attempt: 2, metrics, logger }
    );
    expect(successResult.status).toBe('SUCCEEDED');

    // Permanent failure
    await expect(
      worker.run(
        { testId: 'permanent-job', expectedOutcome: 'PERMANENT_FAILURE' },
        { metrics, logger }
      )
    ).rejects.toThrow(WorkerPermanentError);
    expect(metrics.getCount('job.failed', worker.queueName)).toBe(1);
  });
});
