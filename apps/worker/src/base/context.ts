/**
 * Base Worker Execution Context
 * Provides execution metadata, cooperative cancellation tokens, logging, and progress reporting.
 */

import type { WorkerLogger } from '../shared/logging';
import { StageTimer } from '../shared/metrics';
import { WorkerCancelledError } from './errors';

export interface WorkerExecutionContext {
  jobId: string;
  queueName: string;
  correlationId: string;

  attempt: number;
  maxAttempts: number;

  signal: AbortSignal;

  logger: WorkerLogger;
  timer: StageTimer;

  reportProgress(progress: number, message?: string): Promise<void>;

  isCancelled(): boolean;

  throwIfCancelled(): void;
}

export interface CreateExecutionContextOptions {
  jobId: string;
  queueName: string;
  correlationId: string;
  attempt?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
  logger: WorkerLogger;
  timer?: StageTimer;
  onProgress?: (progress: number, message?: string) => Promise<void>;
}

export function createWorkerExecutionContext(
  options: CreateExecutionContextOptions
): WorkerExecutionContext {
  const signal = options.signal ?? new AbortController().signal;
  const timer = options.timer ?? new StageTimer();
  const attempt = options.attempt ?? 1;
  const maxAttempts = options.maxAttempts ?? 3;

  return {
    jobId: options.jobId,
    queueName: options.queueName,
    correlationId: options.correlationId,
    attempt,
    maxAttempts,
    signal,
    logger: options.logger,
    timer,
    reportProgress: async (progress: number, message?: string) => {
      if (options.onProgress) {
        await options.onProgress(progress, message);
      }
    },
    isCancelled: () => signal.aborted,
    throwIfCancelled: () => {
      if (signal.aborted) {
        throw new WorkerCancelledError(
          signal.reason instanceof Error
            ? signal.reason.message
            : typeof signal.reason === 'string'
              ? signal.reason
              : 'Execution was cancelled'
        );
      }
    },
  };
}
