/**
 * Outbox Publisher Engine
 * 
 * Responsibilities:
 * 1. Safely poll & claim pending PostgreSQL outbox events across multiple publisher instances.
 * 2. Dispatch events to canonical BullMQ queues using deterministic jobIds.
 * 3. Reclaim stale 'PROCESSING' events after publisher process crashes.
 * 4. Move permanently failing events to 'DEAD_LETTER' state.
 * 5. Track infrastructure metrics for publication latency and throughput.
 */

import type { Database, OutboxEvent } from '@repo/db';
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
   */
  async reclaimStaleProcessing(): Promise<number> {
    const staleThreshold = new Date(Date.now() - this.lockTimeoutMs);
    try {
      const result = await this.db.outboxEvent.updateMany({
        where: {
          status: 'PROCESSING',
          updatedAt: { lt: staleThreshold },
        },
        data: {
          status: 'PENDING',
          updatedAt: new Date(),
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
   * Uses token-stamped atomic update to guarantee mutual exclusion across instances.
   */
  async claimPendingEvents(limit: number): Promise<OutboxEvent[]> {
    const now = new Date();
    const claimToken = `claim:${this.publisherId}:${Date.now()}:${Math.random().toString(36).substring(7)}`;

    // 1. Find candidate IDs
    const candidates = await this.db.outboxEvent.findMany({
      where: {
        status: 'PENDING',
        scheduledFor: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    if (candidates.length === 0) {
      return [];
    }

    const candidateIds = candidates.map((c) => c.id);

    // 2. Atomically transition candidates from PENDING to PROCESSING with unique claim token
    const updateResult = await this.db.outboxEvent.updateMany({
      where: {
        id: { in: candidateIds },
        status: 'PENDING',
      },
      data: {
        status: 'PROCESSING',
        lastError: claimToken,
        updatedAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      return [];
    }

    // 3. Return ONLY the rows claimed by this publisher instance
    return await this.db.outboxEvent.findMany({
      where: {
        id: { in: candidateIds },
        status: 'PROCESSING',
        lastError: claimToken,
      },
    });
  }

  /**
   * Dispatches a single outbox event to BullMQ and records publication state.
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
          updatedAt: new Date(),
        },
      });

      this.metrics.increment('outbox.dead_letter');
      return false;
    }

    try {
      const jobId = createDeterministicJobId(targetQueue, event.id);

      await this.queueManager.addJob(
        targetQueue,
        event.eventType,
        event.payload,
        {
          jobId,
          timestamp: event.createdAt.getTime(),
        }
      );

      // Successfully enqueued to BullMQ: mark PUBLISHED
      await this.db.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          updatedAt: new Date(),
          lastError: null,
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

      const nextRetryCount = event.retryCount + 1;
      const isDeadLetter = nextRetryCount >= event.maxRetries;

      if (isDeadLetter) {
        await this.db.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'DEAD_LETTER',
            retryCount: nextRetryCount,
            lastError: `Exhausted retries (${nextRetryCount}/${event.maxRetries}): ${errorMessage}`,
            updatedAt: new Date(),
          },
        });

        this.metrics.increment('outbox.dead_letter', { queue: targetQueue });
        this.logger?.error(`Outbox event ${event.id} permanently failed -> DEAD_LETTER`, dispatchErr);
      } else {
        // Exponential backoff delay: 1s, 2s, 4s, 8s... max 60s
        const backoffDelayMs = Math.min(1000 * Math.pow(2, event.retryCount), 60_000);
        const nextScheduledFor = new Date(Date.now() + backoffDelayMs);

        await this.db.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'PENDING',
            retryCount: nextRetryCount,
            scheduledFor: nextScheduledFor,
            lastError: errorMessage,
            updatedAt: new Date(),
          },
        });

        this.metrics.increment('outbox.publish_failed', { queue: targetQueue });
        this.logger?.warn(
          `Outbox event ${event.id} dispatch failed (attempt ${nextRetryCount}/${event.maxRetries}). Retrying at ${nextScheduledFor.toISOString()}`
        );
      }

      return false;
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

    // 3. Dispatch sequentially or in parallel
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
