/**
 * Idempotency & Distributed Lock Providers
 * 
 * Invariants:
 * 1. Redis lock serializes active execution; it is NOT the correctness guarantee.
 * 2. Durable correctness comes from the database/persisted output check.
 * 3. Lock acquisition failure throws retryable error so BullMQ can reschedule.
 */

import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';

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
 * Production Redis-backed distributed lock provider with safe token release.
 */
export class RedisLockProvider implements IdempotencyProvider {
  constructor(private readonly redis: Redis) {}

  async acquire(key: string, ttlMs: number): Promise<LockHandle | null> {
    const token = randomUUID();
    const result = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
    if (result === 'OK') {
      return {
        key,
        token,
        expiresAt: Date.now() + ttlMs,
      };
    }
    return null;
  }

  async release(handle: LockHandle): Promise<void> {
    // Lua script ensures atomicity: release only if the token matches
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    try {
      await this.redis.eval(script, 1, handle.key, handle.token);
    } catch {
      // Best-effort release, TTL will expire lock if redis fails
    }
  }
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
