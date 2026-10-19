/**
 * Idempotency & Lock Providers (Redis-free)
 *
 * Invariants:
 * 1. The in-memory lock serializes active execution within this process;
 *    it is NOT the correctness guarantee.
 * 2. Durable correctness comes from the database/persisted output check
 *    (checkIdempotency) plus Postgres row leases (claimedBy/claimExpiresAt).
 * 3. Lock acquisition failure throws a retryable error so the publisher
 *    parks the row with backoff and retries it.
 */

import { randomUUID } from 'node:crypto';

export interface LockHandle {
  key: string;
  token: string;
  expiresAt: number;
}

export interface IdempotencyProvider {
  acquire(key: string, ttlMs: number): Promise<LockHandle | null>;
  release(handle: LockHandle): Promise<void>;
}

/**
 * In-memory distributed lock provider for unit and runtime testing.
 */
export class InMemoryLockProvider implements IdempotencyProvider {
  private readonly locks = new Map<string, { token: string; expiresAt: number }>();

  async acquire(key: string, ttlMs: number): Promise<LockHandle | null> {
    const now = Date.now();
    const existing = this.locks.get(key);

    if (existing && existing.expiresAt > now) {
      return null;
    }

    const token = randomUUID();
    const expiresAt = now + ttlMs;
    this.locks.set(key, { token, expiresAt });

    return {
      key,
      token,
      expiresAt,
    };
  }

  async release(handle: LockHandle): Promise<void> {
    const current = this.locks.get(handle.key);
    if (current && current.token === handle.token) {
      this.locks.delete(handle.key);
    }
  }

  clear(): void {
    this.locks.clear();
  }
}

/**
 * No-op lock provider for environments or tests where locking is skipped.
 */
export class NoopLockProvider implements IdempotencyProvider {
  async acquire(key: string, ttlMs: number): Promise<LockHandle | null> {
    return {
      key,
      token: 'noop',
      expiresAt: Date.now() + ttlMs,
    };
  }

  async release(): Promise<void> {
    // no-op
  }
}
