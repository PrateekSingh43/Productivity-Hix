/**
 * PatternWorker — deterministic pattern analysis through BaseWorker.
 *
 * Flow: validate payload (unwrap outbox envelope) -> check idempotency
 * (COMPLETED run, same fingerprint) -> lock -> pre-supersession (a newer
 * analysis of the same window already published) -> load authoritative
 * inputs via PatternDataProvider -> run shared analytics pipeline ->
 * persist run + promoted findings -> post-supersession (inputs changed
 * mid-run -> mark SUPERSEDED, discard).
 *
 * No LLM, no @repo/ai import anywhere in this path.
 */
import { createHash } from "node:crypto";
import { BaseWorker } from "../base/worker";
import { WorkerPermanentError, WorkerValidationError } from "../base/errors";
import type { WorkerExecutionContext } from "../base/context";
import {
  PRODUCTIVEHIX_QUEUES,
  type DomainEventEnvelope,
  type PatternAnalysisJobData,
} from "@repo/types";
import { patternAnalysisJobDataSchema } from "@repo/validation";
import {
  evaluatePatterns,
  isDetectorIdentity,
  PATTERN_CONFIG_VERSION,
  PATTERN_ENGINE_VERSION,
  type DetectorIdentity,
  type PatternPipelineInput,
} from "@repo/analytics";
import { getDb, type Prisma } from "@repo/db";
import { formatJobIdentity } from "../base/identity";
import type { PatternDataProvider } from "./data-provider";
import { PrismaPatternDataProvider } from "./prisma-provider";

type Database = ReturnType<typeof getDb>;

export interface PatternWorkerResult {
  runId: string;
  state: string;
  patternsFound: number;
}

function fingerprint(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function isEnvelope(raw: unknown): raw is DomainEventEnvelope {
  return (
    !!raw && typeof raw === "object" &&
    "payload" in (raw as Record<string, unknown>) &&
    "eventType" in (raw as Record<string, unknown>)
  );
}

export class PatternWorker extends BaseWorker<PatternAnalysisJobData, PatternWorkerResult> {
  readonly workerName = "PatternWorker";
  readonly queueName = PRODUCTIVEHIX_QUEUES.PATTERN_ANALYSIS;
  readonly defaultTimeoutMs = 120_000;

  private readonly preFingerprints = new Map<string, string>();

  constructor(
    private readonly db: Database = getDb(),
    private readonly provider: PatternDataProvider = new PrismaPatternDataProvider(),
  ) {
    super();
  }

  validate(raw: unknown): PatternAnalysisJobData {
    const payload = isEnvelope(raw) ? raw.payload : raw;
    let data: PatternAnalysisJobData;
    try {
      data = patternAnalysisJobDataSchema.parse(payload);
    } catch (err) {
      throw new WorkerValidationError(
        `Invalid pattern job payload: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
    const start = Date.parse(data.windowStart);
    const end = Date.parse(data.windowEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new WorkerPermanentError("Pattern window must be a positive ISO interval.");
    }
    const unknown = (data.targetDetectors ?? []).filter((d) => !isDetectorIdentity(d));
    if (unknown.length > 0) {
      throw new WorkerPermanentError(`Unknown detectors: ${unknown.join(", ")}`);
    }
    return {
      ...data,
      targetDetectors: data.targetDetectors ? [...new Set(data.targetDetectors)].sort() : undefined,
    };
  }

  getJobIdentity(data: PatternAnalysisJobData): string {
    return formatJobIdentity("pattern", [
      data.userId,
      data.windowStart,
      data.windowEnd,
      data.targetDetectors?.length ? data.targetDetectors.join("+") : "all",
      PATTERN_ENGINE_VERSION,
      PATTERN_CONFIG_VERSION,
    ]);
  }

  private selectedDetectors(data: PatternAnalysisJobData): DetectorIdentity[] {
    if (!data.targetDetectors?.length) {
      return ["context_switching_density", "task_execution_fragmentation", "extended_continuous_activity", "schedule_variance"];
    }
    return data.targetDetectors.filter(isDetectorIdentity);
  }

  async computeFingerprint(data: PatternAnalysisJobData): Promise<string> {
    const watermarks = await this.provider.readWatermarks(data);
    return fingerprint([
      data.userId, data.windowStart, data.windowEnd,
      this.selectedDetectors(data),
      PATTERN_ENGINE_VERSION, PATTERN_CONFIG_VERSION,
      watermarks.maxSourceAt,
    ]);
  }

  async checkIdempotency(data: PatternAnalysisJobData): Promise<PatternWorkerResult | null> {
    const identityKey = this.getJobIdentity(data);
    const existing = await this.db.patternAnalysisRun.findUnique({
      where: { userId_identityKey: { userId: data.userId, identityKey } },
    });
    if (!existing || existing.status !== "COMPLETED") return null;
    const current = await this.computeFingerprint(data);
    if (existing.inputFingerprint !== current) return null;
    const patternsFound = await this.db.patternFinding.count({ where: { runId: existing.id } });
    return { runId: existing.id, state: existing.state, patternsFound };
  }

  async checkSuperseded(data: PatternAnalysisJobData): Promise<boolean> {
    const identityKey = this.getJobIdentity(data);
    const stashed = this.preFingerprints.get(identityKey);
    const current = await this.computeFingerprint(data);
    if (stashed === undefined) {
      this.preFingerprints.set(identityKey, current);
      const newer = await this.db.patternAnalysisRun.findFirst({
        where: {
          userId: data.userId,
          windowStart: data.windowStart,
          windowEnd: data.windowEnd,
          status: "COMPLETED",
          computedAt: { gt: new Date(data.queuedAt) },
        },
        orderBy: { computedAt: "desc" },
      });
      return newer !== null;
    }
    this.preFingerprints.delete(identityKey);
    if (current !== stashed) {
      await this.db.patternAnalysisRun.updateMany({
        where: { userId: data.userId, identityKey },
        data: { status: "SUPERSEDED", updatedAt: new Date() },
      });
      return true;
    }
    return false;
  }

  async execute(data: PatternAnalysisJobData, context: WorkerExecutionContext): Promise<PatternWorkerResult> {
    const identityKey = this.getJobIdentity(data);
    const inputFingerprint = this.preFingerprints.get(identityKey) ?? await this.computeFingerprint(data);
    context.throwIfCancelled();

    const run = await this.db.patternAnalysisRun.upsert({
      where: { userId_identityKey: { userId: data.userId, identityKey } },
      create: {
        userId: data.userId,
        windowStart: data.windowStart,
        windowEnd: data.windowEnd,
        identityKey,
        inputFingerprint,
        status: "RUNNING",
        state: "pending",
        detectorVersion: PATTERN_ENGINE_VERSION,
        configVersion: PATTERN_CONFIG_VERSION,
        jobCorrelationId: data.jobCorrelationId,
      },
      update: {
        inputFingerprint,
        status: "RUNNING",
        state: "pending",
        error: null,
        jobCorrelationId: data.jobCorrelationId,
      },
    });

    const selected = new Set(this.selectedDetectors(data));
    const input: PatternPipelineInput = await this.provider.loadInput(data);
    context.throwIfCancelled();
    const result = evaluatePatterns(input);
    context.throwIfCancelled();

    const patterns = result.patterns.filter((p) => selected.has(p.detectorIdentity));
    const state = patterns.length > 0 ? "ok" : result.state === "ok" ? "no-findings" : result.state;

    for (const pattern of patterns) {
      const patternKey = `pattern:${pattern.metadata.patternId}:${PATTERN_ENGINE_VERSION}:${PATTERN_CONFIG_VERSION}`;
      const resultJson = JSON.parse(JSON.stringify(pattern)) as Prisma.InputJsonValue;
      await this.db.patternFinding.upsert({
        where: { userId_patternKey: { userId: data.userId, patternKey } },
        create: {
          userId: data.userId,
          runId: run.id,
          patternKey,
          detectorIdentity: pattern.detectorIdentity,
          patternId: pattern.metadata.patternId,
          status: pattern.executionStatus,
          resultJson,
        },
        update: {
          runId: run.id,
          status: pattern.executionStatus,
          resultJson,
        },
      });
    }
    const liveKeys = new Set(patterns.map((p) =>
      `pattern:${p.metadata.patternId}:${PATTERN_ENGINE_VERSION}:${PATTERN_CONFIG_VERSION}`));
    const previous = await this.db.patternFinding.findMany({ where: { runId: run.id }, select: { id: true, patternKey: true } });
    for (const row of previous) {
      if (!liveKeys.has(row.patternKey)) {
        await this.db.patternFinding.delete({ where: { id: row.id } });
      }
    }

    await this.db.patternAnalysisRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        state,
        diagnosticsJson: JSON.parse(JSON.stringify(result.diagnostics)) as Prisma.InputJsonValue,
        computedAt: new Date(),
      },
    });

    return { runId: run.id, state, patternsFound: patterns.length };
  }

  async onFailure(data: PatternAnalysisJobData | undefined): Promise<void> {
    if (!data) return;
    this.preFingerprints.delete(this.getJobIdentity(data));
  }
}
