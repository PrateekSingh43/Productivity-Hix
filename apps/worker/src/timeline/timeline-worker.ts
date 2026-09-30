/**
 * TimelineWorker — background temporal materialization and durable snapshot engine.
 * 
 * Invariants:
 * 1. Read-only timeline decoupling: All heavy block materialization and snapshot
 *    persistence occurs here in the worker, never blocking GET HTTP requests.
 * 2. Idempotency: If day state is already READY at current revisions, execution is bypassed.
 * 3. Pre/Post-execution supersession: Discards work if newer observation/rule revisions arrived.
 * 4. Atomic activation: New complete snapshot is created and atomically activated.
 *    If an error occurs, the previous active snapshot remains intact.
 * 5. Downstream trigger: Emits 'timeline.window.materialized' outbox event upon completion.
 */

import { BaseWorker } from "../base/worker";
import { WorkerPermanentError, WorkerValidationError } from "../base/errors";
import type { WorkerExecutionContext } from "../base/context";
import {
  PRODUCTIVEHIX_QUEUES,
  type DomainEventEnvelope,
  type TimelineMaterializationJobData,
  resolveLocalDayInterval,
  type TimelineSummary,
} from "@repo/types";
import {
  materializeTemporalBlocks,
  resolveBlockSemantics,
  unionIntervals,
  type BlockEngineInput,
} from "@repo/analytics";
import { getDb, type Prisma } from "@repo/db";
import {
  type WorkerMetricsCollector,
  noopMetricsCollector,
} from "../shared/metrics";

type Database = ReturnType<typeof getDb>;

export interface TimelineWorkerResult {
  snapshotId: string;
  status: "READY" | "SUPERSEDED";
  blockCount: number;
}

function isEnvelope(raw: unknown): raw is DomainEventEnvelope {
  return (
    !!raw &&
    typeof raw === "object" &&
    "payload" in (raw as Record<string, unknown>) &&
    "eventType" in (raw as Record<string, unknown>)
  );
}

export class TimelineWorker extends BaseWorker<TimelineMaterializationJobData, TimelineWorkerResult> {
  readonly workerName = "TimelineWorker";
  readonly queueName = PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION;
  readonly defaultTimeoutMs = 120_000;

  constructor(
    private readonly db: Database = getDb(),
    private readonly metrics: WorkerMetricsCollector = noopMetricsCollector
  ) {
    super();
  }

  override validate(rawJobData: unknown): TimelineMaterializationJobData {
    let payload = rawJobData;
    let jobCorrelationId = "corr-timeline";

    if (isEnvelope(rawJobData)) {
      payload = rawJobData.payload;
      jobCorrelationId = rawJobData.correlationId || jobCorrelationId;
    }

    if (!payload || typeof payload !== "object") {
      throw new WorkerValidationError("TimelineMaterializationJobData must be a non-null object");
    }

    const p = payload as Record<string, unknown>;
    const userId = typeof p.userId === "string" ? p.userId : undefined;
    const localDate = typeof p.localDate === "string" ? p.localDate : undefined;

    if (!userId || !localDate) {
      throw new WorkerValidationError("Timeline job requires valid userId and localDate (YYYY-MM-DD)");
    }

    const requestedRevision = (p.revision ?? p.requestedRevision ?? {}) as Record<string, unknown>;
    // Phase 1 fallback: producers on the current contract emit
    // requestedRevision explicitly, but rows enqueued before the fix (or by
    // any producer still on the old shape) carry flat sourceRevision /
    // ruleRevision. Map those instead of defaulting to 0/0.
    const fallbackObservation =
      typeof requestedRevision.observationRevision === "number"
        ? requestedRevision.observationRevision
        : typeof p.sourceRevision === "number"
          ? p.sourceRevision
          : 0;
    const fallbackRule =
      typeof requestedRevision.ruleRevision === "number"
        ? requestedRevision.ruleRevision
        : typeof p.ruleRevision === "number"
          ? p.ruleRevision
          : 0;

    // Phase 0 instrumentation: count every received job per (user, day) so the
    // coalescing ratio (received vs executed) is observable.
    this.metrics.increment('timeline.received', { queue: this.queueName });

    return {
      userId,
      localDate,
      reason: (p.reason as any) || "TELEMETRY_INGEST",
      requestedRevision: {
        observationRevision: fallbackObservation,
        ruleRevision: fallbackRule,
        semanticVersion: typeof requestedRevision.semanticVersion === "string" ? requestedRevision.semanticVersion : "3b.0.1",
      },
      jobCorrelationId: (p.jobCorrelationId as string) || jobCorrelationId,
      queuedAt: (p.queuedAt as string) || new Date().toISOString(),
    };
  }

  getJobIdentity(data: TimelineMaterializationJobData): string {
    return `${data.userId}:${data.localDate}:${data.requestedRevision.observationRevision}:${data.requestedRevision.ruleRevision}`;
  }

  override async checkIdempotency(jobData: TimelineMaterializationJobData): Promise<TimelineWorkerResult | null> {
    const dayState = await this.db.timelineDayState.findUnique({
      where: { userId_localDate: { userId: jobData.userId, localDate: jobData.localDate } },
    });

    if (!dayState) return null;

    // If day state is already READY, activeSnapshotId is set, and revisions are matched:
    if (
      dayState.status === "READY" &&
      dayState.activeSnapshotId &&
      dayState.materializedObservationRevision >= dayState.currentObservationRevision &&
      dayState.materializedRuleRevision >= dayState.currentRuleRevision
    ) {
      return {
        snapshotId: dayState.activeSnapshotId,
        status: "READY",
        blockCount: 0,
      };
    }

    return null;
  }

  override async checkSuperseded(
    jobData: TimelineMaterializationJobData,
    context: WorkerExecutionContext
  ): Promise<boolean> {
    const dayState = await this.db.timelineDayState.findUnique({
      where: { userId_localDate: { userId: jobData.userId, localDate: jobData.localDate } },
    });

    if (!dayState) return false;

    // Phase 0 revision-skew probe: a zeroed requested revision against a day
    // that already has revisions is the producer/consumer contract mismatch
    // (producers emit sourceRevision; validate only reads revision/requestedRevision).
    if (
      jobData.requestedRevision.observationRevision === 0 &&
      dayState.currentObservationRevision > 0
    ) {
      this.metrics.increment('timeline.revision_skew', { queue: this.queueName });
      context.logger?.warn(
        `Revision skew: job carries observationRevision=0 but day ${jobData.localDate} is at current=${dayState.currentObservationRevision}. ` +
        `Producer/consumer revision contract mismatch — supersession below may misfire.`
      );
    }

    // Pre-execution supersession: If higher revision already materialized, job is obsolete
    if (
      dayState.materializedObservationRevision > jobData.requestedRevision.observationRevision &&
      dayState.materializedRuleRevision >= jobData.requestedRevision.ruleRevision
    ) {
      return true;
    }

    return false;
  }

  /**
   * Phase 4 hardening: a failed run must leave a visible FAILED state with
   * the error recorded. Previously failures left the day stuck in
   * MATERIALIZING forever (indistinguishable from a running job).
   */
  override async onFailure(
    data: TimelineMaterializationJobData,
    error: Error
  ): Promise<void> {
    try {
      await this.db.timelineDayState.update({
        where: { userId_localDate: { userId: data.userId, localDate: data.localDate } },
        data: {
          status: "FAILED",
          lastError: `${error.name ?? "Error"}: ${error.message ?? String(error)}`.slice(0, 500),
          lastAttemptedAt: new Date(),
        },
      });
    } catch {
      // Failure bookkeeping must never throw (day may not exist in tests).
    }
  }

  async execute(
    jobData: TimelineMaterializationJobData,
    context: WorkerExecutionContext
  ): Promise<TimelineWorkerResult> {
    const { userId, localDate } = jobData;
    // Poison guard (same rationale as PatternWorker): a missing users row
    // makes every downstream write FK-fail. Fail permanent up front.
    const owner = await (this.db as unknown as {
      user: { findUnique: (args: unknown) => Promise<{ id: string } | null> };
    }).user.findUnique({ where: { id: userId }, select: { id: true } }).catch(() => ({ id: userId }));
    if (!owner) {
      throw new WorkerPermanentError(
        `Unknown user ${userId}: no users row; refusing poison timeline job.`
      );
    }
    const executeStart = Date.now();
    this.metrics.increment('timeline.executed', { queue: this.queueName });

    // 1. Fetch user timezone preference
    const userPref = await this.db.userPreference.findUnique({
      where: { userId },
      select: { timezone: true },
    });
    const timezone = userPref?.timezone || "UTC";

    // 2. Resolve local day boundary
    const interval = resolveLocalDayInterval(localDate, { timezone });
    const { start: startOfDay, end: endOfDay } = interval;

    // 3. Mark state MATERIALIZING
    const dayState = await this.db.timelineDayState.upsert({
      where: { userId_localDate: { userId, localDate } },
      create: {
        userId,
        localDate,
        currentObservationRevision: jobData.requestedRevision.observationRevision || 1,
        currentRuleRevision: jobData.requestedRevision.ruleRevision || 0,
        status: "MATERIALIZING",
        lastAttemptedAt: new Date(),
      },
      update: {
        status: "MATERIALIZING",
        lastAttemptedAt: new Date(),
      },
    });

    if (context.signal.aborted) {
      throw new WorkerPermanentError("Job aborted prior to block materialization");
    }

    // 4. Query raw telemetry observations intersecting [startOfDay, endOfDay)
    const rawRows = await this.db.normalizedActivity.findMany({
      where: {
        userId,
        timestamp: { gte: new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000), lt: endOfDay },
        duration: { gt: 0 },
      },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
    });

    // Clip raw rows to day interval
    const inputs: BlockEngineInput[] = [];
    for (const row of rawRows) {
      const ts = row.timestamp.getTime();
      const dur = row.duration;
      const end = ts + dur * 1000;
      if (end <= startOfDay.getTime() || ts >= endOfDay.getTime()) continue;

      const clippedStart = Math.max(startOfDay.getTime(), ts);
      const clippedEnd = Math.min(endOfDay.getTime(), end);
      const d = (row.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : {}) as Record<string, unknown>;

      inputs.push({
        activityId: row.id,
        userId,
        deviceId: (row as any).deviceId ?? null,
        source: row.source === "browser" ? "browser" : "desktop",
        watcher: row.watcher,
        start: clippedStart,
        end: clippedEnd,
        // Browser-extension rows carry pageTitle/domain but no application or
        // windowTitle field. Without these fallbacks (mirroring
        // normalizeRawActivityEvents) every tab became application "Unknown"
        // with an empty title — unattributed blobs and missed leisure
        // classification (e.g. ~5h of chess.com invisible as leisure).
        application:
          typeof d.application === "string"
            ? d.application
            : typeof d.app === "string"
              ? d.app
              : row.source === "browser"
                ? "Browser"
                : "Unknown",
        title:
          typeof d.windowTitle === "string"
            ? d.windowTitle
            : typeof d.title === "string" && d.title
              ? d.title
              : typeof d.pageTitle === "string"
                ? d.pageTitle
                : "",
        domain: typeof d.domain === "string" ? d.domain : null,
        url: typeof d.url === "string" ? d.url : null,
        isAfk: row.watcher === "afk" && (d.status === "afk" || d.state === "afk"),
        data: d,
      });
    }

    // 5. Query active rules and overrides
    const rules = await this.db.userActivityRule.findMany({
      where: { userId, isEnabled: true },
      orderBy: { priority: "asc" },
    });

    const overrides = await this.db.userActivityOverride.findMany({
      where: {
        userId,
        targetTimeWindowStart: { lte: endOfDay },
        targetTimeWindowEnd: { gte: startOfDay },
      },
    });

    const mappedRules = rules.map((r) => ({
      id: r.id,
      name: r.name,
      priority: r.priority,
      isEnabled: r.isEnabled,
      applicationPattern: r.applicationPattern,
      titlePattern: r.titlePattern,
      domainPattern: r.domainPattern,
      urlPattern: r.urlPattern,
      assignedModality: r.assignedModality as any,
      assignedContext: r.assignedContext,
      defaultRelevance: null,
    }));

    const mappedOverrides = overrides.map((o) => ({
      id: o.id,
      targetTimeWindowStart: o.targetTimeWindowStart.getTime(),
      targetTimeWindowEnd: o.targetTimeWindowEnd.getTime(),
      targetApplication: o.targetApplication,
      targetClaimFamily: o.targetClaimFamily,
      targetClaimType: o.targetClaimType,
      overriddenValue: o.overriddenValue,
    }));

    // 6. Materialize temporal blocks using pure deterministic engine
    const materializedBlocks = materializeTemporalBlocks(inputs, {
      maxGapMs: 120_000,
      // 180s idle threshold matches ActivityWatch (AFK after 3min idle) and
      // the blueprint's micro-pause tier (<3min stays inside the work block).
      minBreakMs: 180_000,
      transientThresholdMs: 15_000,
      maxBreakMs: 2 * 60 * 60 * 1000,
    });

    // 7. Resolve semantics and format blocks
    const formattedBlocks = materializedBlocks.map((mb, idx) => {
      const semantics = resolveBlockSemantics(
        {
          start: mb.startTime,
          end: mb.endTime,
          application: mb.primaryApplication,
          title: mb.cleanTitle,
          domain: mb.domain,
          url: mb.sanitizedUrl,
          isAfk: mb.isAfkBlock,
          source: mb.sourceChannel,
        },
        { rules: mappedRules, overrides: mappedOverrides }
      );

      const startIso = new Date(mb.startTime).toISOString();
      const endIso = new Date(mb.endTime).toISOString();

      return {
        id: `blk-${localDate}-${idx}`,
        startTime: startIso,
        endTime: endIso,
        wallClockDurationMs: mb.wallClockDurationMs,
        observedActiveDurationMs: mb.observedActiveDurationMs,
        pausedDurationMs: mb.pausedDurationMs,
        track: mb.track,
        primaryApplication: mb.primaryApplication,
        cleanTitle: mb.cleanTitle,
        domain: mb.domain,
        sanitizedUrl: mb.sanitizedUrl,
        sourceChannel: mb.sourceChannel,
        rawEventCount: mb.rawEventCount,
        observationSetFingerprint: mb.observationSetFingerprint,
        isAfkBlock: mb.isAfkBlock,
        activityType: semantics.activityType,
        modality: {
          primary: semantics.primaryModality
            ? {
                value: semantics.primaryModality,
                confidence: semantics.primaryConfidence ?? 1.0,
                provenance: semantics.primaryProvenance,
              }
            : null,
          secondary: [],
        },
        context: semantics.context
          ? {
              value: semantics.context,
              provenance: semantics.contextProvenance || "CONTEXT_HEURISTIC",
            }
          : null,
        intentLink: null,
        focusState: "INATTENTIVE" as const,
      };
    });

    // 8. Assemble summary.
    // Corrected invariant (was: sum of every block wall clock, which counted
    // overnight AFK and double-counted concurrent desktop+browser streams —
    // Sept 23 summed to 24.14h for one day):
    //   totalTrackedMs = union of NON-AFK block spans (active time only,
    //     ActivityWatch headline semantics: active window minus AFK).
    //   breakMs is reported alongside, never inside the total.
    // Category buckets keep wall-clock attribution (concurrent modalities can
    // overlap, so buckets may sum above the unioned total — that is expected).
    let focusedMs = 0;
    let breakMs = 0;
    let browserMs = 0;
    let leisureMs = 0;
    let communicationMs = 0;
    let generalMs = 0;
    const activeSpans: Array<{ start: number; end: number }> = [];

    for (const b of formattedBlocks) {
      const dur = b.wallClockDurationMs || b.observedActiveDurationMs;
      const mod = b.modality.primary?.value;
      if (mod === "idle_away" || b.isAfkBlock) {
        breakMs += dur;
        continue;
      }
      const start = new Date(b.startTime).getTime();
      const end = new Date(b.endTime).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
        activeSpans.push({ start, end });
      }
      if (mod === "development") focusedMs += dur;
      else if (mod === "media_consumption" || mod === "gaming") leisureMs += dur;
      else if (mod === "communication") communicationMs += dur;
      else generalMs += dur;

      if (b.sourceChannel === "BROWSER_TAB") browserMs += dur;
    }

    const totalTrackedMs = unionIntervals(activeSpans).reduce((s, iv) => s + (iv.end - iv.start), 0);

    const summary: TimelineSummary = {
      totalTrackedMs,
      focusedMs,
      browserMs,
      leisureMs,
      breakMs,
      communicationMs,
      generalMs,
      segmentsCount: formattedBlocks.length,
    };

    // 9. Post-execution supersession check: Did a newer revision arrive while computing?
    const freshDayState = await this.db.timelineDayState.findUnique({
      where: { userId_localDate: { userId, localDate } },
    });

    if (
      freshDayState &&
      (freshDayState.currentObservationRevision > dayState.currentObservationRevision ||
        freshDayState.currentRuleRevision > dayState.currentRuleRevision)
    ) {
      // Source mutated mid-execution: discard snapshot and report SUPERSEDED
      context.logger?.info("Day state mutated during execution. Discarding stale snapshot.");
      this.metrics.timing('timeline.materialization_duration', Date.now() - executeStart, {
        queue: this.queueName,
      });
      return {
        snapshotId: "",
        status: "SUPERSEDED",
        blockCount: formattedBlocks.length,
      };
    }

    // 10+11. Persist + activate in ONE transaction (Phase 4 hardening).
    // Previously two sequential writes: a crash between them left orphan
    // snapshots or stuck MATERIALIZING days. Snapshots carry a 30-day TTL
    // (retention cleanup deletes expired non-active rows).
    const snapshot = await this.db.$transaction(async (tx: any) => {
      const created = await tx.timelineSnapshot.create({
        data: {
          userId,
          localDate,
          dayStateId: dayState.id,
          snapshotGeneration: (dayState.materializedObservationRevision || 0) + 1,
          status: "COMPLETE",
          observationRevision: dayState.currentObservationRevision,
          ruleRevision: dayState.currentRuleRevision,
          semanticEngineVersion: "3b.0.1",
          summary: summary as any,
          blocksJson: formattedBlocks as any,
          gapsJson: [] as any,
          blockCount: formattedBlocks.length,
          gapCount: 0,
          startOfDay,
          endOfDay,
          wallClockDurationMs: totalTrackedMs,
          observedActiveDurationMs: focusedMs,
          quietActivityDurationMs: 0,
          prolongedAbsenceDurationMs: breakMs,
          machineUnavailableDurationMs: 0,
          coverageGapDurationMs: 0,
          materializedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.timelineDayState.update({
        where: { id: dayState.id },
        data: {
          activeSnapshotId: created.id,
          materializedObservationRevision: dayState.currentObservationRevision,
          materializedRuleRevision: dayState.currentRuleRevision,
          status: "READY",
          lastMaterializedAt: new Date(),
          lastError: null,
        },
      });

      return created;
    });

    // 12. Downstream fan-out (Phase 5): REMOVED. The former
    // 'timeline.window.materialized' outbox event routed to the
    // analytical-projection queue, which has no registered consumer — every
    // materialization paid one outbox row + one queue job into the void.
    // Pattern analysis is manually triggered; nothing consumes this event.

    return {
      snapshotId: snapshot.id,
      status: "READY",
      blockCount: formattedBlocks.length,
    };
  }
}
