# `@repo/worker` — ProductiveHix Postgres-Direct Worker (no Redis)

Background runtime for ProductiveHix. Owns analytical execution (timeline
materialization, pattern detection, outbox dispatch) so the API stays
limited to HTTP routes + authoritative transactions.

There is no Redis, no BullMQ, no Upstash dependency. Postgres rows ARE the
queue: `timeline_work` (one row per dirty user/day) + `outbox_events`
(pattern requests) are claimed with leases (`claimedBy`/`claimExpiresAt`)
and executed in-process via `TimelineWorker` / `PatternWorker` through the
shared `BaseWorker.run` engine (validation, idempotency, locks,
supersession, timeouts).

## Quick Start

### 1. Environment

```bash
cp apps/worker/.env.example apps/worker/.env
```

Required services:

- **PostgreSQL** — `DATABASE_URL` (required by `@repo/db`). That's the only
  infrastructure the worker needs.

### 2. Run

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

## Execution Overview

The startup sequence — metrics, Postgres-direct `OutboxPublisher` startup
(work-table + outbox → direct worker execution), and graceful
`SIGTERM`/`SIGINT` shutdown — lives in
[`src/bootstrap.ts`](./src/bootstrap.ts). Start there; it is the package
entrypoint (`tsup.config.ts` → `dist/bootstrap.js`).

Retry ownership: Postgres attempts + exponential `availableAt` backoff in
the publisher. Infrastructure outages (DB down, pool exhausted) park rows
WITHOUT consuming attempts; poison payloads count toward `maxAttempts`
then move to `DEAD_LETTER`.
