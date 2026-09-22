/**
 * Phase 0 Worker Shared Infrastructure: Execution Context
 * Provides execution metadata, cancellation tokens, and correlation tracking.
 */

export interface WorkerJobContext {
  jobId: string;
  queueName: string;
  correlationId: string;
  attempt: number;
  timestamp: string;
  isCancelled: () => boolean;
}

export function createJobContext(
  jobId: string,
  queueName: string,
  correlationId: string,
  attempt = 1
): WorkerJobContext {
  let cancelled = false;
  return {
    jobId,
    queueName,
    correlationId,
    attempt,
    timestamp: new Date().toISOString(),
    isCancelled: () => cancelled,
  };
}
