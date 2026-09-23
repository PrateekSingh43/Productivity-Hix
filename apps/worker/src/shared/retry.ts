/**
 * Phase 0 Worker Shared Infrastructure: Retry Policies
 * Standard backoff computation and retry evaluation contracts.
 */

import type { WorkerRetryPolicy } from '@repo/types';
import { WorkerError } from '../base/errors';

export function calculateBackoffDelayMs(attempt: number, policy: WorkerRetryPolicy): number {
  if (policy.backoffType === 'fixed') {
    return policy.baseDelayMs;
  }
  // Exponential backoff: base * 2^(attempt - 1) + jitter
  const exponential = policy.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.random() * 500;
  return Math.round(exponential + jitter);
}

export function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  // Check explicit WorkerError classification
  if (error instanceof WorkerError) {
    return error.isRetryable;
  }

  // Check object with isRetryable property
  if (typeof error === 'object' && 'isRetryable' in error) {
    return Boolean((error as { isRetryable: unknown }).isRetryable);
  }

  if (typeof error !== 'object') return false;
  const msg = (error as { message?: string }).message?.toLowerCase() ?? '';

  // Non-retryable invariant/validation violations
  if (
    msg.includes('validation') ||
    msg.includes('invariant') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden')
  ) {
    return false;
  }

  // Transient database/network errors are retryable by default
  return true;
}

