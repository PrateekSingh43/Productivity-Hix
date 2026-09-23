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
import type { DomainEventEnvelope } from '@repo/types';
import type { QueueManager } from '../runtime/queue';
import { resolveQueueForEvent } from '../queues/registry';
import { createDeterministicJobId } from '../runtime/queue';
import {
  type WorkerMetricsCollector,
  noopMetricsCollector,
} from '../shared/metrics';
import type { WorkerLogger } from '../shared/logging';

export interface OutboxPublisherOptions {
  publisherId?: string;
  db: Database;
  queueManager: QueueManager;
  pollIntervalMs?: number;
  batchSize?: number;
  lockTimeoutMs?: number;
  metrics?: WorkerMetricsCollector;
  logger?: WorkerLogger;
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

  constructor(options: OutboxPublisherOptions) {
    this.publisherId = options.publisherId ?? `pub-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    this.db = options.db;
    this.queueManager = options.queueManager;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.batchSize = options.batchSize ?? 25;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 60_000;
    this.metrics = options.metrics ?? noopMetricsCollector;
    this.logger = options.logger;
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
  async processNextBatch(): Promise<number> {
    // 1. Reclaim any stale crash artifacts
    await this.reclaimStaleProcessing();

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
    this.logger?.info('OutboxPublisher started polling for events');
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
