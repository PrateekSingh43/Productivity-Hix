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
  computeTimelineSummary,
  type BlockEngineInput,
} from "@repo/analytics";
import { getDb, type Prisma } from "@repo/db";

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

  constructor(private readonly db: Database = getDb()) {
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

    return {
      userId,
      localDate,
      reason: (p.reason as any) || "TELEMETRY_INGEST",
      requestedRevision: {
        observationRevision: typeof requestedRevision.observationRevision === "number" ? requestedRevision.observationRevision : 0,
        ruleRevision: typeof requestedRevision.ruleRevision === "number" ? requestedRevision.ruleRevision : 0,
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
    _context: WorkerExecutionContext
  ): Promise<boolean> {
    const dayState = await this.db.timelineDayState.findUnique({
      where: { userId_localDate: { userId: jobData.userId, localDate: jobData.localDate } },
    });

    if (!dayState) return false;

    // Pre-execution supersession: If higher revision already materialized, job is obsolete
    if (
      dayState.materializedObservationRevision > jobData.requestedRevision.observationRevision &&
      dayState.materializedRuleRevision >= jobData.requestedRevision.ruleRevision
    ) {
      return true;
    }

    return false;
  }

  async execute(
    jobData: TimelineMaterializationJobData,
    context: WorkerExecutionContext
  ): Promise<TimelineWorkerResult> {
    const { userId, localDate } = jobData;

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
        application: typeof d.application === "string" ? d.application : typeof d.app === "string" ? d.app : "Unknown",
        title: typeof d.windowTitle === "string" ? d.windowTitle : typeof d.title === "string" ? d.title : "",
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
      minBreakMs: 60_000,
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

    // 8. Assemble summary
    let totalTrackedMs = 0;
    let focusedMs = 0;
    let breakMs = 0;
    let browserMs = 0;
    let leisureMs = 0;
    let communicationMs = 0;
    let generalMs = 0;

    for (const b of formattedBlocks) {
      const dur = b.wallClockDurationMs || b.observedActiveDurationMs;
      totalTrackedMs += dur;
      const mod = b.modality.primary?.value;
      if (mod === "development") focusedMs += dur;
      else if (mod === "idle_away" || b.isAfkBlock) breakMs += dur;
      else if (mod === "media_consumption" || mod === "gaming") leisureMs += dur;
      else if (mod === "communication") communicationMs += dur;
      else generalMs += dur;

      if (b.sourceChannel === "BROWSER_TAB") browserMs += dur;
    }

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
      return {
        snapshotId: "",
        status: "SUPERSEDED",
        blockCount: formattedBlocks.length,
      };
    }

    // 10. Persist TimelineSnapshot in PostgreSQL
    const snapshot = await this.db.timelineSnapshot.create({
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
      },
    });

    // 11. Atomically activate snapshot on TimelineDayState
    await this.db.timelineDayState.update({
      where: { id: dayState.id },
      data: {
        activeSnapshotId: snapshot.id,
        materializedObservationRevision: dayState.currentObservationRevision,
        materializedRuleRevision: dayState.currentRuleRevision,
        status: "READY",
        lastMaterializedAt: new Date(),
        lastError: null,
      },
    });

    // 12. Emit outbox event for downstream workers
    try {
      await this.db.outboxEvent.create({
        data: {
          eventType: "timeline.window.materialized",
          aggregateType: "TimelineDay",
          aggregateId: `${userId}:${localDate}`,
          payload: {
            userId,
            localDate,
            snapshotId: snapshot.id,
            observationRevision: dayState.currentObservationRevision,
            ruleRevision: dayState.currentRuleRevision,
          },
          correlationId: jobData.jobCorrelationId,
          status: "PENDING",
        },
      });
    } catch {
      // Outbox creation failure should not abort successful snapshot activation
    }

    return {
      snapshotId: snapshot.id,
      status: "READY",
      blockCount: formattedBlocks.length,
    };
  }
}
