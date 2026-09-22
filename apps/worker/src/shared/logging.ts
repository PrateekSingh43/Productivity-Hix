/**
 * Phase 0 Worker Shared Infrastructure: Structured Logging
 * Standardized job lifecycle log contracts.
 */

import type { WorkerJobContext } from './context';

export interface WorkerLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, error?: unknown, meta?: Record<string, unknown>) => void;
  debug: (msg: string, meta?: Record<string, unknown>) => void;
}

export function createScopedWorkerLogger(context: WorkerJobContext): WorkerLogger {
  const prefix = `[Worker:${context.queueName}][Job:${context.jobId}][Corr:${context.correlationId}]`;
  return {
    info: (msg, meta) => console.log(`${prefix} ${msg}`, meta ? JSON.stringify(meta) : ''),
    warn: (msg, meta) => console.warn(`${prefix} ${msg}`, meta ? JSON.stringify(meta) : ''),
    error: (msg, err, meta) => console.error(`${prefix} ${msg}`, err, meta ? JSON.stringify(meta) : ''),
    debug: (msg, meta) => console.debug(`${prefix} ${msg}`, meta ? JSON.stringify(meta) : ''),
  };
}
