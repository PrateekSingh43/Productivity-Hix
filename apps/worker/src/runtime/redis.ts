/**
 * Redis Connection Factory for BullMQ & Distributed Locking
 * Supports standard REDIS_URL and Upstash REST credentials.
 */

import { Redis, type RedisOptions } from 'ioredis';

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number | null;
}

export function resolveRedisConnectionConfig(config: RedisConfig = {}): {
  url?: string;
  options: RedisOptions;
} {
  const options: RedisOptions = {
    maxRetriesPerRequest: config.maxRetriesPerRequest ?? null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  };

  if (config.url) {
    if (config.url.startsWith('rediss://')) {
      options.tls = { rejectUnauthorized: false };
    }
    return { url: config.url, options };
  }

  if (process.env.REDIS_URL) {
    const url = process.env.REDIS_URL;
    if (url.startsWith('rediss://')) {
      options.tls = { rejectUnauthorized: false };
    }
    return { url, options };
  }

  // Automatic Upstash resolution from REST credentials
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken) {
    try {
      const hostname = new URL(upstashUrl).hostname;
      const url = `rediss://default:${upstashToken}@${hostname}:6379`;
      options.tls = { rejectUnauthorized: false };
      return { url, options };
    } catch {
      // Fallback to local
    }
  }

  return { options };
}

export function createRedisConnection(config: RedisConfig = {}): Redis {
  const { url, options } = resolveRedisConnectionConfig(config);

  if (url) {
    return new Redis(url, options);
  }

  return new Redis({
    host: config.host ?? process.env.REDIS_HOST ?? '127.0.0.1',
    port: config.port ?? Number(process.env.REDIS_PORT ?? 6379),
    password: config.password ?? process.env.REDIS_PASSWORD,
    db: config.db ?? Number(process.env.REDIS_DB ?? 0),
    ...options,
  });
}
