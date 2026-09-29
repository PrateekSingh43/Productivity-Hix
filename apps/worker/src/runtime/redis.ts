/**
 * Redis Connection Factory for BullMQ & Distributed Locking
 *
 * Resolution order (cloud-first with local fallback):
 *  1. `REDIS_URL` (Upstash cloud, `rediss://...`) — when reachable.
 *  2. Derived `rediss://` URL from `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
 *  3. `REDIS_LOCAL_URL` (e.g. `redis://127.0.0.1:6379`) — local dev fallback.
 *  4. `REDIS_LOCAL_HOST` / `REDIS_LOCAL_PORT` (defaults 127.0.0.1:6379).
 *  5. Legacy `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB`.
 *
 * Use `createResilientRedisConnection()` at bootstrap: it probes the cloud
 * endpoint with a short timeout and falls back to localhost when the cloud
 * is unreachable, instead of crashing the worker.
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

export interface RedisEndpointCandidate {
  /** Human-readable name used in bootstrap logs (e.g. `cloud (REDIS_URL)`). */
  name: string;
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
}

function buildDefaultOptions(config: RedisConfig = {}): RedisOptions {
  return {
    maxRetriesPerRequest: config.maxRetriesPerRequest ?? null, // Required by BullMQ
    enableReadyCheck: config.enableReadyCheck ?? false,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  };
}

function withTlsIfNeeded(url: string, options: RedisOptions): void {
  if (url.startsWith('rediss://')) {
    options.tls = { rejectUnauthorized: false };
  }
}

/**
 * True when the error text indicates an Upstash request-quota (or similar
 * command-budget) rejection. PING still succeeds under quota exhaustion, so
 * callers must check this on write-path failures instead of trusting PING.
 */
export function isQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /max requests limit exceeded|quota exceeded|quota/i.test(message);
}

/**
 * Ordered cloud-first candidate list. Cloud entries are only included when
 * their env vars are present; the local entry is always last so there is
 * always something to fall back to. Set REDIS_FORCE_LOCAL=true to skip all
 * cloud candidates (e.g. when the Upstash free-tier quota is exhausted).
 */
export function getRedisEndpointCandidates(): RedisEndpointCandidate[] {
  const candidates: RedisEndpointCandidate[] = [];
  const forceLocal = process.env.REDIS_FORCE_LOCAL === "true";

  if (process.env.REDIS_URL && !forceLocal) {
    candidates.push({ name: 'cloud (REDIS_URL)', url: process.env.REDIS_URL });
  }

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken && !forceLocal) {
    try {
      const hostname = new URL(upstashUrl).hostname;
      candidates.push({
        name: 'cloud (UPSTASH_REDIS_REST_URL)',
        url: `rediss://default:${upstashToken}@${hostname}:6379`,
      });
    } catch {
      // Ignore malformed Upstash URL; local fallback below still applies.
    }
  }

  if (process.env.REDIS_LOCAL_URL) {
    candidates.push({ name: 'local (REDIS_LOCAL_URL)', url: process.env.REDIS_LOCAL_URL });
  }

  candidates.push({
    name: 'local (REDIS_LOCAL_HOST/REDIS_LOCAL_PORT)',
    host:
      process.env.REDIS_LOCAL_HOST ??
      process.env.REDIS_HOST ??
      '127.0.0.1',
    port: Number(
      process.env.REDIS_LOCAL_PORT ??
        process.env.REDIS_PORT ??
        6379,
    ),
    password: process.env.REDIS_LOCAL_PASSWORD ?? process.env.REDIS_PASSWORD,
    db: Number(process.env.REDIS_LOCAL_DB ?? process.env.REDIS_DB ?? 0),
  });

  return candidates;
}

export function resolveRedisConnectionConfig(config: RedisConfig = {}): {
  url?: string;
  options: RedisOptions;
} {
  const options = buildDefaultOptions(config);

  if (config.url) {
    withTlsIfNeeded(config.url, options);
    return { url: config.url, options };
  }

  if (process.env.REDIS_URL) {
    const url = process.env.REDIS_URL;
    withTlsIfNeeded(url, options);
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

  if (process.env.REDIS_LOCAL_URL) {
    const url = process.env.REDIS_LOCAL_URL;
    withTlsIfNeeded(url, options);
    return { url, options };
  }

  return { options };
}

function instantiateCandidate(
  candidate: RedisEndpointCandidate,
  config: RedisConfig,
  options: RedisOptions,
): Redis {
  if (candidate.url) {
    withTlsIfNeeded(candidate.url, options);
    return new Redis(candidate.url, options);
  }
  return new Redis({
    host: config.host ?? candidate.host ?? '127.0.0.1',
    port: config.port ?? candidate.port ?? 6379,
    password: config.password ?? candidate.password,
    db: config.db ?? candidate.db ?? 0,
    ...options,
  });
}

async function probeCandidate(
  candidate: RedisEndpointCandidate,
  config: RedisConfig,
  timeoutMs: number,
): Promise<{ redis: Redis; health: RedisHealthStatus }> {
  const options = buildDefaultOptions(config);
  // Fail fast while probing so a dead cloud doesn't block local fallback.
  options.retryStrategy = () => null;
  const redis = instantiateCandidate(candidate, config, options);
  try {
    const ping = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`probe timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    if (ping !== 'PONG') {
      throw new Error(`Unexpected ping response: ${ping}`);
    }
    // PING succeeds even when Upstash quota is exhausted, so prove the
    // endpoint can actually execute writes (what BullMQ needs) before
    // selecting it. A quota/command rejection here fails the candidate and
    // lets the next one (ultimately local) win.
    const probeKey = `productivehix:probe:${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await Promise.race([
        (async () => {
          await redis.set(probeKey, 'ok', 'EX', 10);
          await redis.del(probeKey);
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`probe timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
    } catch (writeErr) {
      const message = writeErr instanceof Error ? writeErr.message : String(writeErr);
      const hint = isQuotaError(writeErr)
        ? ' (Upstash request quota exhausted — set REDIS_FORCE_LOCAL=true to use local Redis)'
        : '';
      throw new Error(`Redis write probe failed on ${candidate.name}: ${message}${hint}`);
    }
    const health = await checkRedisHealth(redis);
    return { redis, health };
  } catch (err) {
    try {
      redis.disconnect();
    } catch {
      // Best-effort cleanup of the failed probe client.
    }
    throw err;
  }
}

export interface ResilientRedisConnection {
  redis: Redis;
  /** Which candidate won (e.g. `cloud (REDIS_URL)` or local fallback). */
  selectedEndpoint: string;
  health: RedisHealthStatus;
}

/**
 * Probes cloud-first candidates and returns the first reachable connection.
 * Falls back to localhost when the cloud is down, instead of throwing.
 *
 * @param probeTimeoutMs Per-candidate ping timeout (default 3000ms).
 */
export async function createResilientRedisConnection(
  config: RedisConfig = {},
  logger?: WorkerLogger,
  probeTimeoutMs = Number(process.env.REDIS_PROBE_TIMEOUT_MS ?? 3000),
): Promise<ResilientRedisConnection> {
  const candidates = getRedisEndpointCandidates();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      const { redis, health } = await probeCandidate(candidate, config, probeTimeoutMs);
      if (logger) {
        attachRedisLifecycleListeners(redis, logger);
        logger.info(`Redis selected endpoint: ${candidate.name} (${health.latencyMs}ms)`);
      } else {
        console.log(`[Redis] Selected endpoint: ${candidate.name} (${health.latencyMs}ms)`);
      }
      // Restore BullMQ-friendly retry behaviour for the live client.
      redis.options.retryStrategy = (times: number) => Math.min(times * 100, 3000);
      return { redis, selectedEndpoint: candidate.name, health };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (logger) {
        logger.warn(`Redis endpoint unreachable: ${candidate.name} — ${message}. Trying next.`);
      } else {
        console.warn(`[Redis] Endpoint unreachable: ${candidate.name} — ${message}. Trying next.`);
      }
    }
  }

  throw new Error(
    `No Redis endpoint reachable (tried ${candidates.length}). Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

export function createRedisConnection(config: RedisConfig = {}, logger?: WorkerLogger): Redis {
  const { url, options } = resolveRedisConnectionConfig(config);

  const localHost =
    process.env.REDIS_LOCAL_HOST ?? process.env.REDIS_HOST ?? '127.0.0.1';
  const localPort = Number(
    process.env.REDIS_LOCAL_PORT ?? process.env.REDIS_PORT ?? 6379,
  );
  const localPassword = process.env.REDIS_LOCAL_PASSWORD ?? process.env.REDIS_PASSWORD;
  const localDb = Number(process.env.REDIS_LOCAL_DB ?? process.env.REDIS_DB ?? 0);

  const client = url
    ? new Redis(url, options)
    : new Redis({
        host: config.host ?? localHost,
        port: config.port ?? localPort,
        password: config.password ?? localPassword,
        db: config.db ?? localDb,
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
