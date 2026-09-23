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
import { canonicalSourceWatermarks, type PatternDataProvider } from "./data-provider";
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
      canonicalSourceWatermarks(watermarks),
    ]);
  }

  /**
   * Latest COMPLETED execution for a logical identity, optionally pinned to an
   * exact input fingerprint. History is never mutated; selection is read-only.
   */
  async findCompletedRun(identityKey: string, userId: string, inputFingerprint?: string) {
    return this.db.patternAnalysisRun.findFirst({
      where: {
        userId,
        identityKey,
        status: "COMPLETED",
        ...(inputFingerprint !== undefined ? { inputFingerprint } : {}),
      },
      orderBy: { computedAt: "desc" },
    });
  }

  async checkIdempotency(data: PatternAnalysisJobData): Promise<PatternWorkerResult | null> {
    const identityKey = this.getJobIdentity(data);
    const current = await this.computeFingerprint(data);
    const existing = await this.findCompletedRun(identityKey, data.userId, current);
    if (!existing) return null;
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
        where: { userId: data.userId, identityKey, jobCorrelationId: data.jobCorrelationId, status: "RUNNING" },
        data: { status: "SUPERSEDED", state: "superseded", updatedAt: new Date() },
      });
      return true;
    }
    return false;
  }

  async execute(data: PatternAnalysisJobData, context: WorkerExecutionContext): Promise<PatternWorkerResult> {
    const identityKey = this.getJobIdentity(data);
    const inputFingerprint = this.preFingerprints.get(identityKey) ?? await this.computeFingerprint(data);
    context.throwIfCancelled();

    // Dedupe after lock acquisition: a serialized twin may have completed
    // while this job waited. Never create a second row for identical inputs.
    const already = await this.findCompletedRun(identityKey, data.userId, inputFingerprint);
    if (already) {
      const patternsFound = await this.db.patternFinding.count({ where: { runId: already.id } });
      return { runId: already.id, state: already.state, patternsFound };
    }

    // Every execution gets its own immutable run row. History is append-only;
    // a later execution never overwrites an earlier one.
    const run = await this.db.patternAnalysisRun.create({
      data: {
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
    });

    // Compute entirely in memory: no partial findings ever become visible.
    const selected = new Set(this.selectedDetectors(data));
    const input: PatternPipelineInput = await this.provider.loadInput(data);
    context.throwIfCancelled();
    const result = evaluatePatterns(input);
    context.throwIfCancelled();

    const patterns = result.patterns.filter((p) => selected.has(p.detectorIdentity));
    const state = patterns.length > 0 ? "ok" : result.state === "ok" ? "no-findings" : result.state;
    const findings = patterns.map((pattern) => ({
      patternKey: `pattern:${pattern.metadata.patternId}:${PATTERN_ENGINE_VERSION}:${PATTERN_CONFIG_VERSION}`,
      detectorIdentity: pattern.detectorIdentity,
      patternId: pattern.metadata.patternId,
      status: pattern.executionStatus,
      resultJson: JSON.parse(JSON.stringify(pattern)) as Prisma.InputJsonValue,
    }));
    const diagnosticsJson = JSON.parse(JSON.stringify(result.diagnostics)) as Prisma.InputJsonValue;

    // Freshness gate: never commit results computed from stale inputs.
    // BaseWorker's post-check runs after execute; this gate prevents a stale
    // COMPLETED row from ever becoming durable truth in between.
    const freshFingerprint = await this.computeFingerprint(data);
    if (freshFingerprint !== inputFingerprint) {
      await this.db.patternAnalysisRun.updateMany({
        where: { userId: data.userId, identityKey, jobCorrelationId: data.jobCorrelationId, status: "RUNNING" },
        data: { status: "SUPERSEDED", state: "superseded" },
      });
      return { runId: run.id, state: "superseded", patternsFound: 0 };
    }

    // Atomic publication: this execution's findings + diagnostics + terminal
    // state commit together. Findings are created (never upserted, never
    // reassigned): each belongs permanently to this run row. A concurrent
    // owner is never overwritten: guard on correlation id.
    await this.db.$transaction(async (tx) => {
      for (const pattern of findings) {
        await tx.patternFinding.create({
          data: {
            userId: data.userId,
            runId: run.id,
            patternKey: pattern.patternKey,
            detectorIdentity: pattern.detectorIdentity,
            patternId: pattern.patternId,
            status: pattern.status,
            resultJson: pattern.resultJson,
          },
        });
      }
      const claimed = await tx.patternAnalysisRun.updateMany({
        where: { id: run.id, jobCorrelationId: data.jobCorrelationId, status: "RUNNING" },
        data: { status: "COMPLETED", state, diagnosticsJson, computedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new WorkerPermanentError(
          `Pattern run ${run.id} no longer owned by job ${data.jobCorrelationId}; refusing partial publish.`,
        );
      }
    });

    return { runId: run.id, state, patternsFound: patterns.length };
  }

  /**
   * Durable terminal failure. Runs owned by THIS job (correlation id +
   * still RUNNING) move to FAILED with sanitized error info; runs owned by a
   * newer retry are never clobbered. Retries create their own run row.
   */
  async onFailure(data: PatternAnalysisJobData | undefined, error?: Error): Promise<void> {
    if (!data) return;
    const identityKey = this.getJobIdentity(data);
    this.preFingerprints.delete(identityKey);
    const message = error instanceof Error ? error.message : String(error ?? "unknown failure");
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "UNKNOWN";
    await this.db.patternAnalysisRun.updateMany({
      where: { userId: data.userId, identityKey, jobCorrelationId: data.jobCorrelationId, status: "RUNNING" },
      data: {
        status: "FAILED",
        state: "failed",
        error: `${code}: ${message}`.slice(0, 500),
        computedAt: new Date(),
      },
    });
  }
}
