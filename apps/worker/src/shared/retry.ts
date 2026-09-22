/**
 * Phase 0 Worker Shared Infrastructure: Retry Policies
 * Standard backoff computation and retry evaluation contracts.
 */

import type { WorkerRetryPolicy } from '@repo/types';

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
  if (!error || typeof error !== 'object') return false;
  const msg = (error as { message?: string }).message?.toLowerCase() ?? '';
  // Non-retryable invariant violations
  if (msg.includes('validation') || msg.includes('invariant') || msg.includes('unauthorized')) {
    return false;
  }
  // Transient database/network errors are retryable
  return true;
}
