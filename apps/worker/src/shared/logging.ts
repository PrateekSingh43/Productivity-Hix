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

export interface WorkerLogContext {
  queueName: string;
  jobId: string;
  correlationId: string;
}

export function createScopedWorkerLogger(context: WorkerLogContext): WorkerLogger {
  const prefix = `[Worker:${context.queueName}][Job:${context.jobId}][Corr:${context.correlationId}]`;
  return {
    info: (msg, meta) => console.log(`${prefix} ${msg}`, meta ? JSON.stringify(meta) : ''),
    warn: (msg, meta) => console.warn(`${prefix} ${msg}`, meta ? JSON.stringify(meta) : ''),
    error: (msg, err, meta) => console.error(`${prefix} ${msg}`, err, meta ? JSON.stringify(meta) : ''),
    debug: (msg, meta) => console.debug(`${prefix} ${msg}`, meta ? JSON.stringify(meta) : ''),
  };
}

export class MemoryWorkerLogger implements WorkerLogger {
  public readonly logs: { level: string; msg: string; meta?: Record<string, unknown>; error?: unknown }[] = [];

  info(msg: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'info', msg, meta });
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'warn', msg, meta });
  }

  error(msg: string, error?: unknown, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'error', msg, error, meta });
  }

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.logs.push({ level: 'debug', msg, meta });
  }

  clear(): void {
    this.logs.length = 0;
  }
}

