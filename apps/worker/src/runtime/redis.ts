/**
 * Redis Connection Factory for BullMQ & Distributed Locking
 * Supports standard REDIS_URL and Upstash REST credentials.
 * Includes health monitoring, lifecycle hooks, and clean connection management.
 */

import { Redis, type RedisOptions } from 'ioredis';
import type { WorkerLogger } from '../shared/logging';

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number | null;
  enableReadyCheck?: boolean;
}

export interface RedisHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  mode: string;
  connected: boolean;
  connectedClients?: number;
  uptimeInSeconds?: number;
  error?: string;
}

export function resolveRedisConnectionConfig(config: RedisConfig = {}): {
  url?: string;
  options: RedisOptions;
} {
  const options: RedisOptions = {
    maxRetriesPerRequest: config.maxRetriesPerRequest ?? null, // Required by BullMQ
    enableReadyCheck: config.enableReadyCheck ?? false,
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

export function createRedisConnection(config: RedisConfig = {}, logger?: WorkerLogger): Redis {
  const { url, options } = resolveRedisConnectionConfig(config);

  const client = url
    ? new Redis(url, options)
    : new Redis({
        host: config.host ?? process.env.REDIS_HOST ?? '127.0.0.1',
        port: config.port ?? Number(process.env.REDIS_PORT ?? 6379),
        password: config.password ?? process.env.REDIS_PASSWORD,
        db: config.db ?? Number(process.env.REDIS_DB ?? 0),
        ...options,
      });

  if (logger) {
    attachRedisLifecycleListeners(client, logger);
  }

  return client;
}

export function attachRedisLifecycleListeners(redis: Redis, logger: WorkerLogger): void {
  redis.on('connect', () => logger.debug('Redis client initiating connection'));
  redis.on('ready', () => logger.info('Redis connection ready'));
  redis.on('reconnecting', (ms: number) => logger.warn(`Redis reconnecting in ${ms}ms`));
  redis.on('error', (err: Error) => logger.error('Redis connection error', err));
  redis.on('close', () => logger.debug('Redis connection closed'));
}

/**
 * Probes the Redis connection and returns structured health metrics.
 */
export async function checkRedisHealth(redis: Redis): Promise<RedisHealthStatus> {
  const startTime = Date.now();
  try {
    const pong = await redis.ping();
    const latencyMs = Date.now() - startTime;

    if (pong !== 'PONG') {
      return {
        status: 'degraded',
        latencyMs,
        mode: 'unknown',
        connected: true,
        error: `Unexpected ping response: ${pong}`,
      };
    }

    let connectedClients: number | undefined;
    let uptimeInSeconds: number | undefined;
    let mode = 'standalone';

    try {
      const info = await redis.info('server');
      const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/);
      if (uptimeMatch?.[1]) {
        uptimeInSeconds = parseInt(uptimeMatch[1], 10);
      }
      const modeMatch = info.match(/redis_mode:(\w+)/);
      if (modeMatch?.[1]) {
        mode = modeMatch[1];
      }

      const clientInfo = await redis.info('clients');
      const clientsMatch = clientInfo.match(/connected_clients:(\d+)/);
      if (clientsMatch?.[1]) {
        connectedClients = parseInt(clientsMatch[1], 10);
      }
    } catch {
      // Some managed services (e.g. Upstash REST proxy or restricted commands) may restrict INFO commands
    }

    return {
      status: latencyMs > 500 ? 'degraded' : 'healthy',
      latencyMs,
      mode,
      connected: true,
      connectedClients,
      uptimeInSeconds,
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - startTime,
      mode: 'disconnected',
      connected: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Cleanly closes the Redis connection with fallback to disconnect.
 */
export async function closeRedisConnection(redis: Redis): Promise<void> {
  try {
    if (redis.status !== 'end') {
      await redis.quit();
    }
  } catch {
    redis.disconnect();
  }
}
