# `@repo/worker` — ProductiveHix Dedicated Worker Runtime

Background job runtime for ProductiveHix. Owns all BullMQ-backed analytical
execution (timeline materialization, pattern detection, outbox publishing) so
the API stays limited to HTTP routes + authoritative transactions.

## Quick Start

### 1. Environment

```bash
cp apps/worker/.env.example apps/worker/.env
```

Required services:

- **PostgreSQL** — `DATABASE_URL` (required by `@repo/db`).
- **Redis** — cloud-first via `REDIS_URL` (or the `UPSTASH_REDIS_REST_URL` +
  `UPSTASH_REDIS_REST_TOKEN` pair), with automatic fallback to local Redis
  (`REDIS_LOCAL_URL`, default `redis://127.0.0.1:6379`). See
  `src/runtime/redis.ts` for the full resolution order.

### 2. Local Redis via compose

```bash
docker compose -f docker-compose.redis.yml up -d
```

This starts `redis:7` on `6379` plus a Redis GUI on
[`http://localhost:8001`](http://localhost:8001).

### 3. Run

```bash
# Watch mode (development)
pnpm --filter @repo/worker dev

# Production build + start (dist/ is produced by tsup)
pnpm --filter @repo/worker build
pnpm --filter @repo/worker start

# Checks
pnpm --filter @repo/worker lint
pnpm --filter @repo/worker test
pnpm --filter @repo/worker check-types
```

`turbo run build` includes this package via the `build` (`tsup`) script.

## Job / Queue Overview

The full startup sequence — resilient Redis connect, queue manager, worker
runtime, domain worker registration (`TimelineWorker`, `PatternWorker`),
outbox publisher startup, and graceful `SIGTERM`/`SIGINT` shutdown — lives in
[`src/bootstrap.ts`](./src/bootstrap.ts). Start there; it is the package
entrypoint (`tsup.config.ts` → `dist/bootstrap.js`).
