/**
 * Outbox Publisher Engine
 * 
 * Responsibilities:
 * 1. Safely poll & claim pending PostgreSQL outbox events across multiple publisher instances
 *    using PostgreSQL FOR UPDATE SKIP LOCKED (or atomic token claim).
 * 2. Dispatch events to canonical BullMQ queues carrying the complete DomainEventEnvelope<T>.
 * 3. Reclaim stale 'PROCESSING' events when claimExpiresAt passes (crash recovery).
 * 4. Move permanently failing events to 'DEAD_LETTER' state after exhausting maxAttempts.
 * 5. Provide bounded retention cleanup for successfully published events.
 * 6. Track infrastructure metrics for publication latency and throughput.
 */

import type { Database, OutboxEvent } from '@repo/db';
import { PRODUCTIVEHIX_QUEUES, type DomainEventEnvelope } from '@repo/types';
import { InMemoryLockProvider, type IdempotencyProvider } from '../base/idempotency';
import { TimelineWorker } from '../timeline/timeline-worker';
import type { QueueManager } from '../runtime/queue';
import { resolveQueueForEvent } from '../queues/registry';
import { createDeterministicJobId } from '../runtime/queue';
import {
  type WorkerMetricsCollector,
  noopMetricsCollector,
} from '../shared/metrics';
import type { WorkerLogger } from '../shared/logging';

export interface DirectExecutor {
  (payload: unknown, opts: {
    jobId: string;
    correlationId: string;
    attempt: number;
    maxAttempts: number;
  }): Promise<{ status: string }>;
}

export interface OutboxPublisherOptions {
  publisherId?: string;
  db: Database;
  queueManager: QueueManager;
  pollIntervalMs?: number;
  batchSize?: number;
  lockTimeoutMs?: number;
  metrics?: WorkerMetricsCollector;
  logger?: WorkerLogger;
  /** Phase 4: retention sweep cadence. Default 6h; 0 disables. */
  cleanupIntervalMs?: number;
  /** Phase 4: retention horizon for terminal rows. Default 7 days. */
  retentionMs?: number;
  /**
   * Phase 3: executes timeline work inline instead of enqueueing to BullMQ.
   * Defaults to a lazily constructed TimelineWorker with a process-local
   * in-memory lock (correct for a single publisher process; multi-process
   * deployments must keep the BullMQ path until a shared lock lands).
   */
  directExecutor?: DirectExecutor;
}

/**
 * True when a dispatch failure is an infrastructure outage (Redis down,
 * quota exhausted, connection lost) rather than a poison payload. Infra
 * failures must park the event WITHOUT consuming publication attempts —
 * otherwise a transient outage deterministically dead-letters healthy
 * events and breaks the at-least-once outbox guarantee.
 */
export function isInfrastructureError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /max requests limit exceeded|quota|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|Connection is closed|ECONNRESET|READONLY|LOADING|MISCONF/i.test(
    message
  );
}

export class OutboxPublisher {
  public readonly publisherId: string;
  private readonly db: Database;
  private readonly queueManager: QueueManager;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly lockTimeoutMs: number;
  private readonly metrics: WorkerMetricsCollector;
  private readonly logger?: WorkerLogger;

  private isRunning = false;
  private abortController: AbortController | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private activeProcessingPromise: Promise<number> | null = null;
  private lastOpsSummaryAt = 0;
  private static readonly OPS_SUMMARY_INTERVAL_MS = 60_000;
  private readonly cleanupIntervalMs: number;
  private readonly retentionMs: number;
  private lastCleanupAt = 0;

  private directExecutor?: DirectExecutor;
  private directLocks?: IdempotencyProvider;
  private directWorker?: TimelineWorker;

  constructor(options: OutboxPublisherOptions) {
    this.publisherId = options.publisherId ?? `pub-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    this.db = options.db;
    this.queueManager = options.queueManager;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.batchSize = options.batchSize ?? 25;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 60_000;
    this.metrics = options.metrics ?? noopMetricsCollector;
    this.logger = options.logger;
    this.directExecutor = options.directExecutor;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 6 * 60 * 60 * 1000;
    this.retentionMs = options.retentionMs ?? 7 * 24 * 60 * 60 * 1000;
  }

  /**
   * Reclaims stale events that were stuck in PROCESSING due to publisher crashes.
   * Uses claimExpiresAt to determine whether an active lease has expired.
   */
  async reclaimStaleProcessing(): Promise<number> {
    const now = new Date();
    try {
      const result = await this.db.outboxEvent.updateMany({
        where: {
          status: 'PROCESSING',
          claimExpiresAt: { lt: now },
        },
        data: {
          status: 'PENDING',
          claimedBy: null,
          claimExpiresAt: null,
          updatedAt: now,
        },
      });

      if (result.count > 0) {
        this.metrics.increment('outbox.reclaimed');
        this.logger?.warn(`Reclaimed ${result.count} stale outbox events stuck in PROCESSING`);
      }

      // Phase 2: same lease recovery for coalesced work rows.
      const db = this.db as any;
      if (typeof db.timelineWork?.updateMany === 'function') {
        const work = await db.timelineWork.updateMany({
          where: { status: 'PROCESSING', claimExpiresAt: { lt: now } },
          data: { status: 'PENDING', claimedBy: null, claimExpiresAt: null, updatedAt: now },
        });
        if (work.count > 0) {
          this.logger?.warn(`Reclaimed ${work.count} stale timeline work rows stuck in PROCESSING`);
        }
        return result.count + work.count;
      }
      return result.count;
    } catch (err) {
      this.logger?.error('Error reclaiming stale outbox events', err);
      return 0;
    }
  }

  /**
   * Concurrency-safe claim of pending outbox events.
   * Uses PostgreSQL FOR UPDATE SKIP LOCKED via $queryRaw if available on the client.
   * Falls back to atomic updateMany on claimedBy without ever modifying lastError.
   */
  async claimPendingEvents(limit: number): Promise<OutboxEvent[]> {
    const now = new Date();
    const claimExpiresAt = new Date(now.getTime() + this.lockTimeoutMs);

    // 1. Try real PostgreSQL FOR UPDATE SKIP LOCKED
    if (typeof (this.db as any).$queryRaw === 'function') {
      try {
        const rawResults = await (this.db as any).$queryRaw`
          WITH candidates AS (
            SELECT id FROM "outbox_events"
            WHERE "status" = 'PENDING'::"OutboxStatus" AND "available_at" <= ${now}
            ORDER BY "created_at" ASC
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          )
          UPDATE "outbox_events"
          SET "status" = 'PROCESSING'::"OutboxStatus",
              "claimed_by" = ${this.publisherId},
              "claim_expires_at" = ${claimExpiresAt},
              "last_attempt_at" = ${now},
              "updated_at" = ${now}
          WHERE id IN (SELECT id FROM candidates)
          RETURNING *;
        `;

        if (Array.isArray(rawResults) && rawResults.length > 0) {
          // Normalize column names from snake_case if raw query returns snake_case
          return rawResults.map((r: any) => ({
            id: r.id,
            eventType: r.eventType ?? r.event_type,
            aggregateType: r.aggregateType ?? r.aggregate_type,
            aggregateId: r.aggregateId ?? r.aggregate_id,
            payload: r.payload,
            correlationId: r.correlationId ?? r.correlation_id,
            causationId: r.causationId ?? r.causation_id,
            schemaVersion: r.schemaVersion ?? r.schema_version,
            occurredAt: r.occurredAt ?? r.occurred_at,
            status: r.status,
            publicationAttemptCount: r.publicationAttemptCount ?? r.publication_attempt_count ?? 0,
            maxAttempts: r.maxAttempts ?? r.max_attempts ?? 5,
            availableAt: r.availableAt ?? r.available_at,
            claimedBy: r.claimedBy ?? r.claimed_by,
            claimExpiresAt: r.claimExpiresAt ?? r.claim_expires_at,
            lastAttemptAt: r.lastAttemptAt ?? r.last_attempt_at,
            lastError: r.lastError ?? r.last_error,
            publishedAt: r.publishedAt ?? r.published_at,
            createdAt: r.createdAt ?? r.created_at,
            updatedAt: r.updatedAt ?? r.updated_at,
          })) as OutboxEvent[];
        } else if (Array.isArray(rawResults)) {
          return [];
        }
      } catch (rawErr) {
        // In unit test mocks or when $queryRaw is unsupported, proceed to standard atomic update
        this.logger?.debug('Falling back from $queryRaw to ORM claim');
      }
    }

    // 2. ORM-level fallback using claimedBy
    const candidates = await this.db.outboxEvent.findMany({
      where: {
        status: 'PENDING',
        availableAt: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    if (candidates.length === 0) {
      return [];
    }

    const candidateIds = candidates.map((c) => c.id);

    const updateResult = await this.db.outboxEvent.updateMany({
      where: {
        id: { in: candidateIds },
        status: 'PENDING',
      },
      data: {
        status: 'PROCESSING',
        claimedBy: this.publisherId,
        claimExpiresAt: claimExpiresAt,
        lastAttemptAt: now,
        updatedAt: now,
      },
    });

    if (updateResult.count === 0) {
      return [];
    }

    return await this.db.outboxEvent.findMany({
      where: {
        id: { in: candidateIds },
        status: 'PROCESSING',
        claimedBy: this.publisherId,
      },
    });
  }

  /**
   * Dispatches a single outbox event to BullMQ carrying the full DomainEventEnvelope<T>.
   */
  async dispatchEvent(event: OutboxEvent): Promise<boolean> {
    const startTime = Date.now();
    const targetQueue = resolveQueueForEvent(event.eventType);

    if (!targetQueue) {
      const errorMsg = `No canonical queue registered for event type: ${event.eventType}`;
      this.logger?.error(errorMsg);

      await this.db.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'DEAD_LETTER',
          lastError: errorMsg,
          claimedBy: null,
          claimExpiresAt: null,
          updatedAt: new Date(),
        },
      });

      this.metrics.increment('outbox.dead_letter');
      return false;
    }

    try {
      const jobId = createDeterministicJobId(targetQueue, event.id);

      // Construct canonical DomainEventEnvelope
      const envelope: DomainEventEnvelope = {
        id: event.id,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload,
        correlationId: event.correlationId,
        causationId: event.causationId,
        schemaVersion: event.schemaVersion,
        occurredAt:
          event.occurredAt instanceof Date
            ? event.occurredAt.toISOString()
            : String(event.occurredAt),
      };

      await this.queueManager.addJob(
        targetQueue,
        event.eventType,
        envelope,
        {
          jobId,
          timestamp:
            event.createdAt instanceof Date
              ? event.createdAt.getTime()
              : Date.now(),
        }
      );

      // Successfully enqueued to BullMQ: mark PUBLISHED
      await this.db.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          claimedBy: null,
          claimExpiresAt: null,
          lastError: null,
          updatedAt: new Date(),
        },
      });

      const latencyMs = Date.now() - startTime;
      this.metrics.increment('outbox.published', { queue: targetQueue });
      this.metrics.timing('outbox.latency', latencyMs, { queue: targetQueue });

      this.logger?.debug(`Published outbox event ${event.id} to queue ${targetQueue}`);
      return true;
    } catch (dispatchErr) {
      const errorMessage =
        dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);

      // Infrastructure outage: park WITHOUT consuming an attempt. The event
      // is healthy; the transport is not. Backoff still applies via
      // availableAt so we don't hot-loop against a dead endpoint.
      if (isInfrastructureError(dispatchErr)) {
        const backoffDelayMs = Math.min(1000 * Math.pow(2, event.publicationAttemptCount), 60_000);
        const nextAvailableAt = new Date(Date.now() + backoffDelayMs);

        await this.db.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'PENDING',
            availableAt: nextAvailableAt,
            lastError: `[infra] dispatch unavailable (attempt count unchanged at ${event.publicationAttemptCount}/${event.maxAttempts}): ${errorMessage}`,
            claimedBy: null,
            claimExpiresAt: null,
            updatedAt: new Date(),
          },
        });

        this.metrics.increment('outbox.publish_failed', { queue: targetQueue });
        this.logger?.warn(
          `Outbox event ${event.id} dispatch hit infrastructure outage; parked without consuming an attempt. Next try at ${nextAvailableAt.toISOString()}: ${errorMessage}`
        );
        return false;
      }

      const nextAttemptCount = event.publicationAttemptCount + 1;
      const isDeadLetter = nextAttemptCount >= event.maxAttempts;

      if (isDeadLetter) {
        await this.db.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'DEAD_LETTER',
            publicationAttemptCount: nextAttemptCount,
            lastError: `Exhausted publication retries (${nextAttemptCount}/${event.maxAttempts}): ${errorMessage}`,
            claimedBy: null,
            claimExpiresAt: null,
            updatedAt: new Date(),
          },
        });

        this.metrics.increment('outbox.dead_letter', { queue: targetQueue });
        this.logger?.error(`Outbox event ${event.id} permanently failed -> DEAD_LETTER`, dispatchErr);
      } else {
        // Exponential backoff: 1s, 2s, 4s, 8s... max 60s
        const backoffDelayMs = Math.min(1000 * Math.pow(2, event.publicationAttemptCount), 60_000);
        const nextAvailableAt = new Date(Date.now() + backoffDelayMs);

        await this.db.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'PENDING',
            publicationAttemptCount: nextAttemptCount,
            availableAt: nextAvailableAt,
            lastError: errorMessage,
            claimedBy: null,
            claimExpiresAt: null,
            updatedAt: new Date(),
          },
        });

        this.metrics.increment('outbox.publish_failed', { queue: targetQueue });
        this.logger?.warn(
          `Outbox event ${event.id} dispatch failed (attempt ${nextAttemptCount}/${event.maxAttempts}). Retrying at ${nextAvailableAt.toISOString()}`
        );
      }

      return false;
    }
  }

  /**
   * Bounded retention cleanup for published events.
   * Deletes outbox records older than the retention threshold.
   * Invariant: Never deletes source/application truth.
   */
  async cleanupPublishedEvents(retentionMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - retentionMs);
    try {
      const result = await this.db.outboxEvent.deleteMany({
        where: {
          status: 'PUBLISHED',
          publishedAt: { lt: cutoff },
        },
      });

      if (result.count > 0) {
        this.logger?.info(`Cleaned up ${result.count} published outbox records older than ${cutoff.toISOString()}`);
      }
      return result.count;
    } catch (err) {
      this.logger?.error('Error cleaning up published outbox events', err);
      return 0;
    }
  }

  /**
   * Executes one polling and dispatch cycle.
   * Returns count of events processed.
   */
  /**
   * Phase 0 ops visibility: once a minute, log pending depth + oldest
   * pending age (single cheap aggregate). This is the backlog signal —
   * persistent growth here means the dispatcher, not Redis, is behind.
   */
  async logOpsSummary(): Promise<void> {
    const now = Date.now();
    if (now - this.lastOpsSummaryAt < OutboxPublisher.OPS_SUMMARY_INTERVAL_MS) return;
    this.lastOpsSummaryAt = now;
    try {
      const rows = (await (this.db as any).outboxEvent.groupBy({
        by: ['status'],
        _count: { _all: true },
        _min: { createdAt: true },
        where: { status: { in: ['PENDING', 'PROCESSING', 'DEAD_LETTER'] } },
      })) as Array<{ status: string; _count: { _all: number }; _min: { createdAt: Date | null } }>;
      const summary = rows
        .map((r) => {
          const ageSec =
            r._min.createdAt != null ? Math.round((now - new Date(r._min.createdAt).getTime()) / 1000) : -1;
          return `${r.status}=${r._count._all}(oldest ${ageSec}s)`;
        })
        .join(' ');
      this.logger?.info(`Outbox backlog: ${summary || 'empty'}`);
    } catch (err) {
      this.logger?.debug('Outbox backlog summary unavailable', { error: String(err) });
    }
  }

  /**
   * Phase 2 coalesced dispatch: claims due timeline_work rows (one per dirty
   * user/day) and enqueues each as a single timeline-materialization job
   * carrying the row's latest requested revisions. Enabled only when
   * TIMELINE_WORK_DISPATCH=true; the legacy outbox path stays default.
   */
  private workDispatchEnabled(): boolean {
    return process.env.TIMELINE_WORK_DISPATCH === 'true';
  }

  /**
   * Phase 3: execute timeline work inline (no BullMQ/Redis) when
   * TIMELINE_DIRECT_DISPATCH=true. Uses the same BaseWorker.run engine —
   * validation, idempotency, locks, supersession, timeouts — with a
   * process-local lock provider. Correct for a single publisher process;
   * multi-process deployments must keep the queue path until a shared
   * lock lands. A custom executor may be injected (tests do this).
   */
  private directDispatchEnabled(): boolean {
    return process.env.TIMELINE_DIRECT_DISPATCH === 'true';
  }

  private async executeWorkDirectly(
    payload: unknown,
    opts: { jobId: string; correlationId: string; attempt: number; maxAttempts: number }
  ): Promise<void> {
    if (this.directExecutor) {
      await this.directExecutor(payload, opts);
      return;
    }
    if (!this.directLocks) this.directLocks = new InMemoryLockProvider();
    if (!this.directWorker) this.directWorker = new TimelineWorker(this.db);
    await this.directWorker.run(payload, {
      jobId: opts.jobId,
      correlationId: opts.correlationId,
      attempt: opts.attempt,
      maxAttempts: opts.maxAttempts,
      idempotencyProvider: this.directLocks,
      metrics: this.metrics,
      logger: this.logger,
    });
    // run() resolves SUCCEEDED/SUPERSEDED or throws — both are terminal for
    // the work row (obsolete work completing as SUPERSEDED is still done).
  }

  async dispatchTimelineWork(): Promise<number> {
    const now = new Date();
    const claimExpiresAt = new Date(now.getTime() + this.lockTimeoutMs);
    const db = this.db as any;
    if (typeof db.timelineWork?.findMany !== 'function') return 0;

    const due = await db.timelineWork.findMany({
      where: { status: 'PENDING', availableAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: this.batchSize,
    });
    let done = 0;
    for (const row of due) {
      const claimed = await db.timelineWork.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: {
          status: 'PROCESSING',
          claimedBy: this.publisherId,
          claimExpiresAt,
          updatedAt: now,
        },
      });
      if (!claimed || claimed.count === 0) continue; // lost the race

      const workPayload = {
        userId: row.userId,
        localDate: row.localDate,
        reason: 'TELEMETRY_INGEST',
        requestedRevision: {
          observationRevision: row.requestedObservationRevision ?? 0,
          ruleRevision: row.requestedRuleRevision ?? 0,
          semanticVersion: '3b.0.1',
        },
        jobCorrelationId: `work-${row.id}`,
        queuedAt: new Date().toISOString(),
      };
      const workJobId = createDeterministicJobId(
        PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION,
        `work-${row.id}`
      );

      try {
        if (this.directDispatchEnabled()) {
          await this.executeWorkDirectly(workPayload, {
            jobId: workJobId,
            correlationId: `work-${row.id}`,
            attempt: (row.attempts ?? 0) + 1,
            maxAttempts: row.maxAttempts ?? 5,
          });
        } else {
          await this.queueManager.addJob(
            PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION,
            'timeline.work.requested',
            workPayload,
            { jobId: workJobId, timestamp: Date.now() }
          );
        }
        await db.timelineWork.update({
          where: { id: row.id },
          data: {
            status: 'COMPLETED',
            claimedBy: null,
            claimExpiresAt: null,
            lastError: null,
            updatedAt: new Date(),
          },
        });
        this.metrics.increment('timeline.work_dispatched', {
          queue: PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION,
        });
        done++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isInfrastructureError(err)) {
          // Infra outage: park without consuming an attempt (same rule as outbox).
          const backoffMs = Math.min(1000 * Math.pow(2, row.attempts ?? 0), 60_000);
          await db.timelineWork.update({
            where: { id: row.id },
            data: {
              status: 'PENDING',
              availableAt: new Date(Date.now() + backoffMs),
              lastError: `[infra] dispatch unavailable (attempts unchanged at ${row.attempts ?? 0}): ${message}`,
              claimedBy: null,
              claimExpiresAt: null,
              updatedAt: new Date(),
            },
          });
          this.logger?.warn(`Timeline work ${row.id} hit infrastructure outage; parked without consuming an attempt.`);
        } else {
          const attempts = (row.attempts ?? 0) + 1;
          const maxAttempts = row.maxAttempts ?? 5;
          if (attempts >= maxAttempts) {
            await db.timelineWork.update({
              where: { id: row.id },
              data: {
                status: 'DEAD_LETTER',
                attempts,
                lastError: `Exhausted work retries (${attempts}/${maxAttempts}): ${message}`,
                claimedBy: null,
                claimExpiresAt: null,
                updatedAt: new Date(),
              },
            });
            this.metrics.increment('timeline.work_failed', {
              queue: PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION,
            });
            this.logger?.error(`Timeline work ${row.id} permanently failed -> DEAD_LETTER`, err);
          } else {
            const backoffMs = Math.min(1000 * Math.pow(2, row.attempts ?? 0), 60_000);
            await db.timelineWork.update({
              where: { id: row.id },
              data: {
                status: 'PENDING',
                attempts,
                availableAt: new Date(Date.now() + backoffMs),
                lastError: message,
                claimedBy: null,
                claimExpiresAt: null,
                updatedAt: new Date(),
              },
            });
            this.logger?.warn(`Timeline work ${row.id} dispatch failed (attempt ${attempts}/${maxAttempts}).`);
          }
        }
      }
    }
    return done;
  }

  /**
   * Phase 4 scheduled retention: terminal outbox rows + completed work rows
   * older than the horizon, plus expired non-active snapshots. Each step is
   * independently guarded so a missing model (older clients, unit fakes)
   * skips instead of failing the sweep.
   */
  async runRetentionCleanup(now = new Date()): Promise<void> {
    if (this.cleanupIntervalMs <= 0) return;
    if (now.getTime() - this.lastCleanupAt < this.cleanupIntervalMs) return;
    this.lastCleanupAt = now.getTime();
    try {
      const pruned = await this.cleanupPublishedEvents(this.retentionMs);
      if (pruned > 0) this.logger?.info(`Retention: pruned ${pruned} published outbox rows`);
    } catch (err) {
      this.logger?.warn('Retention: outbox cleanup failed', { error: String(err) });
    }
    try {
      const db = this.db as any;
      if (typeof db.timelineWork?.deleteMany === 'function') {
        const cutoff = new Date(now.getTime() - this.retentionMs);
        const pruned = await db.timelineWork.deleteMany({
          where: { status: { in: ['COMPLETED', 'DEAD_LETTER'] }, updatedAt: { lt: cutoff } },
        });
        if (pruned.count > 0) this.logger?.info(`Retention: pruned ${pruned.count} terminal timeline work rows`);
      }
    } catch (err) {
      this.logger?.warn('Retention: work cleanup failed', { error: String(err) });
    }
    try {
      const db = this.db as any;
      if (typeof db.$queryRaw === 'function') {
        const pruned = await db.$queryRaw`
          DELETE FROM "timeline_snapshots" WHERE "expires_at" < ${now}
          AND "id" NOT IN (SELECT "active_snapshot_id" FROM "timeline_day_states" WHERE "active_snapshot_id" IS NOT NULL)`;
        const count = Array.isArray(pruned) ? pruned.length : Number((pruned as any)?.count ?? 0);
        if (count > 0) this.logger?.info(`Retention: pruned ${count} expired snapshots`);
      }
    } catch (err) {
      this.logger?.warn('Retention: snapshot cleanup failed', { error: String(err) });
    }
  }

  async processNextBatch(): Promise<number> {
    // 1. Reclaim any stale crash artifacts
    await this.reclaimStaleProcessing();

    // 1b. Periodic ops visibility (non-blocking cadence, cheap aggregate)
    await this.logOpsSummary();

    // 1c. Phase 2 coalesced path: dirty days first when enabled.
    if (this.workDispatchEnabled()) {
      await this.dispatchTimelineWork();
    }

    // 1d. Phase 4 scheduled retention (cadence-gated, cheap when idle).
    await this.runRetentionCleanup();

    // 2. Claim pending batch
    const claimedEvents = await this.claimPendingEvents(this.batchSize);
    if (claimedEvents.length === 0) {
      return 0;
    }

    // 3. Dispatch sequentially
    let successCount = 0;
    for (const event of claimedEvents) {
      if (this.abortController?.signal.aborted) {
        break;
      }
      const ok = await this.dispatchEvent(event);
      if (ok) successCount++;
    }

    return successCount;
  }

  /**
   * Starts background polling loop.
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.abortController = new AbortController();

    const scheduleNext = () => {
      if (!this.isRunning) return;

      this.pollTimer = setTimeout(async () => {
        if (!this.isRunning) return;

        try {
          this.activeProcessingPromise = this.processNextBatch();
          const processed = await this.activeProcessingPromise;
          this.activeProcessingPromise = null;

          // If we had a full batch, poll again sooner to drain queue
          const delay = processed >= this.batchSize ? 50 : this.pollIntervalMs;
          if (this.isRunning) {
            scheduleNext();
          }
        } catch (err) {
          this.activeProcessingPromise = null;
          this.logger?.error('Error in outbox publisher polling loop', err);
          if (this.isRunning) {
            scheduleNext();
          }
        }
      }, this.pollIntervalMs);
    };

    scheduleNext();
    this.logger?.info(
      `OutboxPublisher started polling for events (timeline dispatch: ${
        this.directDispatchEnabled() ? 'direct-inline (no Redis)' : 'BullMQ queue'
      }, work-table: ${
        process.env.TIMELINE_WORK_DISPATCH === 'true' ? 'preferred' : 'observe-only'
      })`
    );
  }

  /**
   * Graceful stop: cancels timer and awaits in-flight batch completion.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.abortController) {
      this.abortController.abort();
    }

    if (this.activeProcessingPromise) {
      try {
        await this.activeProcessingPromise;
      } catch {
        // Ignore errors during in-flight shutdown
      }
      this.activeProcessingPromise = null;
    }

    this.logger?.info('OutboxPublisher stopped gracefully');
  }

  isPublisherRunning(): boolean {
    return this.isRunning;
  }
}
