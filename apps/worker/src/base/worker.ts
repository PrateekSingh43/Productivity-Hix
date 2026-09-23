/**
 * Base Worker Contract and Execution Runtime
 * 
 * Invariants (Plan v3 W-A through W-O):
 * 1. Payload validation happens before any resource allocation.
 * 2. Deterministic job identity provides queue-level uniqueness.
 * 3. Domain output idempotency check precedes distributed locking.
 * 4. Lock acquisition failure throws retryable error for BullMQ backoff.
 * 5. Pre- and post-execution supersession checks prevent executing or publishing stale results.
 * 6. Cooperative timeouts are enforced via AbortController and AbortSignal.
 * 7. BullMQ owns retry attempts and backoff; BaseWorker normalizes and classifies errors.
 * 8. Never import @repo/ai into BaseWorker or low-level workers.
 */

import {
  WorkerError,
  WorkerValidationError,
  WorkerTimeoutError,
  WorkerCancelledError,
  WorkerRetryableError,
  WorkerPermanentError,
} from './errors';
import type { WorkerResult } from './result';
import {
  type WorkerExecutionContext,
  createWorkerExecutionContext,
} from './context';
import type { IdempotencyProvider, LockHandle } from './idempotency';
import {
  createScopedWorkerLogger,
  type WorkerLogger,
} from '../shared/logging';
import {
  StageTimer,
  type WorkerMetricsCollector,
  noopMetricsCollector,
} from '../shared/metrics';
import { isRetryableError } from '../shared/retry';

export interface BaseWorkerRunOptions {
  jobId?: string;
  correlationId?: string;
  attempt?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  idempotencyProvider?: IdempotencyProvider;
  lockTtlMs?: number;
  metrics?: WorkerMetricsCollector;
  signal?: AbortSignal;
  onProgress?: (progress: number, message?: string) => Promise<void>;
  logger?: WorkerLogger;
}

export abstract class BaseWorker<TData, TResult> {
  abstract readonly workerName: string;
  abstract readonly queueName: string;
  readonly defaultTimeoutMs: number = 60_000;
  readonly defaultLockTtlMs: number = 120_000;

  /**
   * Validates raw input payload against schema.
   * Throws WorkerValidationError if invalid.
   */
  abstract validate(raw: unknown): TData;

  /**
   * Produces a deterministic logical identity for the requested computation.
   */
  abstract getJobIdentity(data: TData): string;

  /**
   * Verifies whether durable target output already exists in storage.
   * Returns existing result if idempotent, or null if computation must run.
   */
  abstract checkIdempotency(data: TData): Promise<TResult | null>;

  /**
   * Checks whether the job's input data or target window has been superseded
   * by newer mutations in authoritative storage.
   */
  abstract checkSuperseded(
    data: TData,
    context: WorkerExecutionContext
  ): Promise<boolean>;

  /**
   * Core domain execution logic.
   * Must respect context.signal for cooperative cancellation.
   */
  abstract execute(
    data: TData,
    context: WorkerExecutionContext
  ): Promise<TResult>;

  /**
   * Generates the distributed lock resource key for transient serialization.
   * Default implementation uses `lock:${queueName}:${jobIdentity}`.
   */
  getLockKey(data: TData, jobIdentity: string): string {
    return `lock:${this.queueName}:${jobIdentity}`;
  }

  // ==========================================================================
  // Lifecycle Hooks (Optional)
  // ==========================================================================

  beforeExecute?(data: TData, context: WorkerExecutionContext): Promise<void>;
  afterExecute?(data: TData, result: TResult, context: WorkerExecutionContext): Promise<void>;
  onFailure?(data: TData, error: Error, context: WorkerExecutionContext): Promise<void>;
  onSuperseded?(data: TData, context: WorkerExecutionContext): Promise<void>;

  // ==========================================================================
  // Execution Engine
  // ==========================================================================

  async run(
    raw: unknown,
    options: BaseWorkerRunOptions = {}
  ): Promise<WorkerResult<TResult>> {
    const metrics = options.metrics ?? noopMetricsCollector;
    const timer = new StageTimer();
    metrics.increment('job.started', { queue: this.queueName });

    // 1. Validation
    timer.start('validation');
    let data: TData;
    try {
      data = this.validate(raw);
    } catch (err) {
      metrics.increment('job.failed', { queue: this.queueName });
      if (err instanceof WorkerError) {
        throw err;
      }
      throw new WorkerValidationError(
        `Validation failed for ${this.workerName}: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    } finally {
      timer.end('validation');
    }

    // 2. Identity Resolution
    const jobIdentity = this.getJobIdentity(data);
    const jobId = options.jobId ?? jobIdentity;
    const correlationId = options.correlationId ?? jobIdentity;

    const logger =
      options.logger ??
      createScopedWorkerLogger({
        queueName: this.queueName,
        jobId,
        correlationId,
      });

    // 3. Timeout and Cooperative Cancellation Setup
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const abortController = new AbortController();
    let timeoutTimer: NodeJS.Timeout | null = null;

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        abortController.abort(
          new WorkerTimeoutError(
            `Job ${jobId} on queue ${this.queueName} timed out after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
    }

    // Propagate parent signal if provided
    if (options.signal) {
      if (options.signal.aborted) {
        abortController.abort(options.signal.reason);
      } else {
        options.signal.addEventListener(
          'abort',
          () => abortController.abort(options.signal?.reason),
          { once: true }
        );
      }
    }

    const context = createWorkerExecutionContext({
      jobId,
      queueName: this.queueName,
      correlationId,
      attempt: options.attempt ?? 1,
      maxAttempts: options.maxAttempts ?? 3,
      signal: abortController.signal,
      logger,
      timer,
      onProgress: options.onProgress,
    });

    let lockHandle: LockHandle | null = null;
    const lockProvider = options.idempotencyProvider;

    try {
      context.throwIfCancelled();

      // 4. Domain-level Idempotency Check (Check if result already exists)
      timer.start('idempotency');
      const existingResult = await this.checkIdempotency(data);
      timer.end('idempotency');

      if (existingResult !== null) {
        logger.info('Idempotent output already exists in durable storage. Bypassing execution.');
        metrics.increment('job.succeeded', { queue: this.queueName });
        const finishedTimer = timer.finish();
        metrics.timing('job.duration', finishedTimer.totalDurationMs, { queue: this.queueName });
        return {
          status: 'SUCCEEDED',
          value: existingResult,
        };
      }

      // 5. Distributed Execution Lock Acquisition (Transient Mutex)
      if (lockProvider) {
        timer.start('lock_acquire');
        const lockKey = this.getLockKey(data, jobIdentity);
        const lockTtlMs = options.lockTtlMs ?? this.defaultLockTtlMs;
        lockHandle = await lockProvider.acquire(lockKey, lockTtlMs);
        timer.end('lock_acquire');

        if (!lockHandle) {
          logger.warn(`Execution lock currently held for resource: ${lockKey}. Rescheduling via BullMQ.`);
          throw new WorkerRetryableError(`Execution lock busy for ${lockKey}`);
        }
      }

      // 6. Pre-Execution Supersession Check
      context.throwIfCancelled();
      timer.start('supersession_pre');
      const isPreSuperseded = await this.checkSuperseded(data, context);
      timer.end('supersession_pre');

      if (isPreSuperseded) {
        logger.info('Job inputs superseded before execution. Skipping computation.');
        metrics.increment('job.superseded', { queue: this.queueName });
        if (this.onSuperseded) {
          await this.onSuperseded(data, context);
        }
        const finishedTimer = timer.finish();
        metrics.timing('job.duration', finishedTimer.totalDurationMs, { queue: this.queueName });
        return {
          status: 'SUPERSEDED',
        };
      }

      // 7. Execution with lifecycle hooks
      if (this.beforeExecute) {
        await this.beforeExecute(data, context);
      }

      timer.start('execution');
      const result = await this.execute(data, context);
      timer.end('execution');

      // 8. Post-Execution Supersession Check
      context.throwIfCancelled();
      timer.start('supersession_post');
      const isPostSuperseded = await this.checkSuperseded(data, context);
      timer.end('supersession_post');

      if (isPostSuperseded) {
        logger.warn('Source data mutated during execution. Discarding stale result.');
        metrics.increment('job.superseded', { queue: this.queueName });
        if (this.onSuperseded) {
          await this.onSuperseded(data, context);
        }
        const finishedTimer = timer.finish();
        metrics.timing('job.duration', finishedTimer.totalDurationMs, { queue: this.queueName });
        return {
          status: 'SUPERSEDED',
        };
      }

      if (this.afterExecute) {
        await this.afterExecute(data, result, context);
      }

      metrics.increment('job.succeeded', { queue: this.queueName });
      const finishedTimer = timer.finish();
      metrics.timing('job.duration', finishedTimer.totalDurationMs, { queue: this.queueName });
      logger.info('Job execution completed successfully.', {
        durationMs: finishedTimer.totalDurationMs,
      });

      return {
        status: 'SUCCEEDED',
        value: result,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // Classify error
      let normalizedError: WorkerError;
      if (error instanceof WorkerError) {
        normalizedError = error;
      } else if (abortController.signal.aborted) {
        if (abortController.signal.reason instanceof WorkerError) {
          normalizedError = abortController.signal.reason;
        } else {
          normalizedError = new WorkerCancelledError(
            `Execution aborted: ${abortController.signal.reason?.message ?? String(abortController.signal.reason)}`,
            error
          );
        }
      } else if (isRetryableError(error)) {
        normalizedError = new WorkerRetryableError(error.message, error);
      } else {
        normalizedError = new WorkerPermanentError(error.message, error);
      }

      if (normalizedError.code === 'TIMEOUT') {
        metrics.increment('job.timeout', { queue: this.queueName });
      } else if (normalizedError.isRetryable) {
        metrics.increment('job.retryable_failure', { queue: this.queueName });
      } else {
        metrics.increment('job.failed', { queue: this.queueName });
      }

      logger.error('Job execution failed.', normalizedError, {
        code: normalizedError.code,
        isRetryable: normalizedError.isRetryable,
        durationMs: timer.finish().totalDurationMs,
      });

      if (this.onFailure) {
        try {
          await this.onFailure(data, normalizedError, context);
        } catch (hookErr) {
          logger.error('Error in onFailure hook.', hookErr);
        }
      }

      throw normalizedError;
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
      if (lockHandle && lockProvider) {
        try {
          await lockProvider.release(lockHandle);
        } catch (releaseErr) {
          logger.error('Failed to release execution lock.', releaseErr);
        }
      }
    }
  }
}
