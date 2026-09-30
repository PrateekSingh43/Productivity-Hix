import type {
  AnalyticalWindow, BehavioralPatternOutput, CheckIn, EarlySignal, EvidenceTimeline, InsightOutput, WorkSession,
} from "@repo/types";
import { resolveProductiveDay } from "@repo/types";
import { createHash, randomUUID } from "node:crypto";
import {
  collectEarlySignals,
  composeInsights,
  contextConfig,
  continuousThresholds,
  countDistinctCalendarDays,
  escapeHatchThresholds,
  evaluatePatterns,
  fragmentationConfig,
  goldenHoursThresholds,
  isDetectorIdentity,
  plannedActualThresholds,
  scheduleConfig,
  startFrictionThresholds,
  subtractCalendarDays,
  type DetectorDiagnostics,
  type OutcomeInput,
  type PatternsState,
  type RecordingHistory,
  type ReflectionInput,
} from "@repo/analytics";
import { getDb } from "../../lib/prisma";
import { activityInRange } from "../activity/service";
import { listCheckIns } from "../check-ins/service";
import { listSessions } from "../sessions/service";
import { assembleEvidence, compare, overlaps } from "./evidence";

export type { DetectorDiagnostics, PatternsState, RecordingHistory };
export type { EarlySignal };
export interface PatternsResponse {
  state: PatternsState;
  window: AnalyticalWindow;
  patterns: BehavioralPatternOutput[];
  /**
   * Honest low-confidence observations (Task 5). Populated only alongside
   * `state: insufficient-evidence`; never part of `patterns`.
   */
  earlySignals: EarlySignal[];
  diagnostics: { perDetector: DetectorDiagnostics[]; recordingHistory?: RecordingHistory };
}
export interface InsightsResponse {
  state: PatternsState;
  window: AnalyticalWindow;
  insights: import("@repo/types").InsightOutput[];
  diagnostics: PatternsResponse["diagnostics"];
}
export class BadRequest extends Error {
  readonly statusCode = 400;
}

export function resolveWindow(from?: unknown, to?: unknown, now = new Date()): AnalyticalWindow {
  const parse = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
      throw new BadRequest("from/to must be ISO dates or timestamps with a timezone.");
    }
    const ms = Date.parse(value);
    const day = value.slice(0, 10);
    if (!Number.isFinite(ms) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
      throw new BadRequest("Invalid from/to date.");
    }
    return ms;
  };
  const end = parse(to, now.getTime());
  const start = parse(from, end - 14 * 86400000);
  if (start >= end || end - start > 90 * 86400000) throw new BadRequest("The half-open window must be positive and at most 90 days.");
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

interface Data {
  userId: string;
  timezone: string;
  boundary: string;
  window: AnalyticalWindow;
  baselineWindow: AnalyticalWindow;
  timeline: EvidenceTimeline;
  baseline: EvidenceTimeline;
  sessions: WorkSession[];
  reports: CheckIn[];
  outcomes: OutcomeInput[];
  tasks: Array<{ id: string; completedAt: Date | null; plannedStart: Date | null; plannedDurationMinutes: number | null }>;
  connected: boolean;
  recordingHistory: RecordingHistory;
}

async function readRecordingHistory(userId: string, timezone: string): Promise<Omit<RecordingHistory, "connected">> {
  const db = getDb();
  const rows = typeof db.$queryRaw === "function" ? await db.$queryRaw<Array<{
    min_time: Date | null; max_time: Date | null; distinct_days: bigint;
  }>>`
    SELECT MIN("timestamp") AS min_time, MAX("timestamp") AS max_time,
      COUNT(DISTINCT DATE("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})) AS distinct_days
    FROM "normalized_activity"
    WHERE "user_id" = ${userId}
  ` : undefined;
  if (rows?.[0]) {
    return {
      firstObservationAt: rows[0].min_time?.toISOString() ?? null,
      lastObservationAt: rows[0].max_time?.toISOString() ?? null,
      recordedDays: Number(rows[0].distinct_days),
    };
  }
  const events = await db.normalizedActivity.findMany({ where: { userId }, select: { timestamp: true } });
  const timestamps = events.map((event) => event.timestamp.toISOString()).sort();
  return {
    firstObservationAt: timestamps[0] ?? null,
    lastObservationAt: timestamps[timestamps.length - 1] ?? null,
    recordedDays: countDistinctCalendarDays(timestamps, timezone),
  };
}

async function readData(userId: string, window: AnalyticalWindow): Promise<Data> {
  const db = getDb();
  const preferences = await db.userPreference.findUnique({ where: { userId } });
  const timezone = preferences?.timezone ?? "UTC";
  const baselineWindow = { start: subtractCalendarDays(window.start, 30, timezone), end: window.start };
  const range = { from: new Date(baselineWindow.start), to: new Date(window.end) };
  const [events, sessions, reports, tasks, goals, activityCount, recordingHistory, desktopCount, browserCount] = await Promise.all([
    activityInRange(userId, range.from, range.to), listSessions(userId, range), listCheckIns(userId, range),
    db.task.findMany({ where: { userId }, select: { id: true, completedAt: true, plannedStart: true, plannedDurationMinutes: true } }),
    db.dailyGoal.findMany({ where: { userId, plan: { date: { gte: resolveProductiveDay(window.start, { timezone }), lte: resolveProductiveDay(window.end, { timezone }) } } },
      select: { id: true, outcome: true, plan: { select: { date: true } }, tasks: { select: { id: true } } } }),
    db.normalizedActivity.count({ where: { userId } }),
    readRecordingHistory(userId, timezone),
    db.desktopDevice.count({ where: { userId } }), db.browserInstallation.count({ where: { userId } }),
  ]);
  sessions.sort((a, b) => compare(a.startedAt, b.startedAt) || compare(a.id, b.id));
  reports.sort((a, b) => compare(a.id, b.id));
  tasks.sort((a, b) => compare(a.id, b.id));
  const outcomes: OutcomeInput[] = goals.flatMap<OutcomeInput>((goal) => {
    const outcome = goal.outcome;
    if (outcome !== "ACHIEVED" && outcome !== "PARTIALLY_ACHIEVED" && outcome !== "NOT_ACHIEVED") return [];
    // Honest task linkage only: a goal linked to exactly one task carries
    // that task id; zero or several linked tasks carry none (never picked
    // arbitrarily). No occasion window exists on a goal row, so none is
    // invented — unlinked outcomes stay unaligned downstream (fail closed).
    const taskIds = [...new Set((goal.tasks ?? []).map((task) => task.id))].sort();
    return [{ recordId: goal.id, date: goal.plan.date, goalOutcome: outcome,
      ...(taskIds.length === 1 && taskIds[0] ? { taskId: taskIds[0] } : {}) }];
  }).sort((a, b) => compare(a.recordId, b.recordId));
  return {
    userId, timezone, boundary: preferences?.dayBoundary ?? "00:00", window, baselineWindow, sessions, reports, tasks, outcomes,
    timeline: assembleEvidence(userId, window, events, sessions, reports),
    baseline: assembleEvidence(userId, baselineWindow, events, sessions, reports),
    connected: desktopCount + browserCount + activityCount > 0,
    recordingHistory: { ...recordingHistory, connected: desktopCount + browserCount > 0 },
  };
}

export interface PatternAnalysisRequest {
  accepted: boolean;
  correlationId: string;
  jobCorrelationId: string;
  requestId: string;
  state: "RUNNING";
  window: AnalyticalWindow;
}

export type PatternRunStatus = "NO_RUN" | "RUNNING" | "COMPLETED" | "FAILED";

export interface PatternReadiness {
  activity: "recorded" | "none";
  evidence: "sufficient" | "insufficient" | "unknown";
  analysis: "completed" | "running" | "failed" | "never";
  patterns: "found" | "none" | "unknown";
}

export interface AnalysisBlocked {
  reason: "worker-offline" | "request-failed";
  requestedAt: string;
}

export interface PersistedPatternsResponse extends PatternsResponse {
  runStatus: PatternRunStatus;
  runId: string | null;
  computedAt: string | null;
  readiness: PatternReadiness;
  /**
   * Set only on NO_RUN when the user asked for analysis and it never
   * produced a run: either the request sits unclaimed (no worker daemon is
   * consuming the queue) or it dead-lettered. Without this, "Run analysis"
   * is a silent no-op and failures are invisible.
   */
  analysisBlocked?: AnalysisBlocked | null;
}

/** A request sitting longer than this with no RUNNING row means no worker is consuming the queue. */
const STALLED_REQUEST_MS = 120_000;

async function blockedAnalysis(userId: string): Promise<AnalysisBlocked | null> {
  const db = getDb() as unknown as {
    outboxEvent?: {
      findFirst: (args: unknown) => Promise<{ status: string; occurredAt: Date } | null>;
    };
    patternAnalysisRun?: {
      findFirst: (args: unknown) => Promise<{ computedAt: Date | null } | null>;
    };
  };
  if (typeof db.outboxEvent?.findFirst !== "function") return null;
  const request = await db.outboxEvent.findFirst({
    where: { aggregateId: userId, eventType: "pattern.analysis.requested" },
    orderBy: { occurredAt: "desc" },
    select: { status: true, occurredAt: true },
  });
  if (!request) return null;
  // A newer terminal run supersedes the request (it was honored after all).
  const terminal = typeof db.patternAnalysisRun?.findFirst === "function"
    ? await db.patternAnalysisRun.findFirst({
      where: { userId, status: { in: ["COMPLETED", "FAILED"] } },
      orderBy: { computedAt: "desc" },
      select: { computedAt: true },
    })
    : null;
  if (terminal?.computedAt && terminal.computedAt.getTime() > request.occurredAt.getTime()) return null;
  if (request.status === "DEAD_LETTER") {
    return { reason: "request-failed", requestedAt: request.occurredAt.toISOString() };
  }
  if (request.status === "PENDING" && Date.now() - request.occurredAt.getTime() > STALLED_REQUEST_MS) {
    return { reason: "worker-offline", requestedAt: request.occurredAt.toISOString() };
  }
  return null;
}

export async function requestPatternAnalysis(
  userId: string,
  window: AnalyticalWindow,
  targetDetectors?: string[],
): Promise<PatternAnalysisRequest> {
  const unknown = (targetDetectors ?? []).filter((d) => !isDetectorIdentity(d));
  if (unknown.length > 0) throw new BadRequest(`Unknown detectors: ${unknown.join(", ")}`);
  const jobCorrelationId = randomUUID();
  const queuedAt = new Date().toISOString();
  await getDb().outboxEvent.create({
    data: {
      eventType: "pattern.analysis.requested",
      aggregateType: "pattern",
      aggregateId: userId,
      payload: {
        userId,
        windowStart: window.start,
        windowEnd: window.end,
        ...(targetDetectors ? { targetDetectors: [...new Set(targetDetectors)].sort() } : {}),
        reason: "MANUAL_TRIGGER",
        jobCorrelationId,
        queuedAt,
      },
      correlationId: jobCorrelationId,
      schemaVersion: "1.0.0",
    },
  });
  return { accepted: true, correlationId: jobCorrelationId, jobCorrelationId, requestId: jobCorrelationId, state: "RUNNING", window };
}

function emptyDiagnostics(): PatternsResponse["diagnostics"] {
  return { perDetector: [] };
}

/**
 * Derives honest early signals from stored per-detector diagnostics (Task 5).
 * Only meaningful alongside `insufficient-evidence`; every other state gets
 * []. Defensive defaults keep older stored rows (missing counts) signal-free
 * instead of inventing observations.
 */
function earlySignalsFor(state: PatternsState, diagnostics: PatternsResponse["diagnostics"]): EarlySignal[] {
  if (state !== "insufficient-evidence") return [];
  return collectEarlySignals((diagnostics.perDetector ?? []).map((d) => ({
    identity: d.identity,
    status: d.status,
    reason: d.reason,
    eligibleOccasions: d.eligibleOccasions ?? 0,
    eligibleDays: d.eligibleDays ?? 0,
    meanCoverageRatio: d.meanCoverageRatio ?? null,
    availability: d.availability ?? "AVAILABLE",
  })));
}

/**
 * Minimum evidence bar per available detector, sourced from the same
 * configuration objects the pipeline enforces — never duplicated literals.
 * Covers all 8 detectors; NOT_AVAILABLE entries are still excluded by the
 * availability check at the call site.
 */
const EVIDENCE_BAR: Record<string, { occasions: number; days: number }> = {
  context_switching_density: {
    occasions: contextConfig.minimumQualifyingSessions,
    days: contextConfig.minimumQualifyingCalendarDays,
  },
  task_execution_fragmentation: {
    occasions: fragmentationConfig.minimumQualifyingEpisodes,
    days: fragmentationConfig.minimumQualifyingCalendarDays,
  },
  extended_continuous_activity: {
    occasions: continuousThresholds.minimumComparableOccasions,
    days: continuousThresholds.minimumDistinctDays,
  },
  schedule_variance: {
    occasions: scheduleConfig.minimumQualifyingTaskInstances,
    days: scheduleConfig.minimumDistinctCalendarDays,
  },
  golden_hours_focus: {
    occasions: goldenHoursThresholds.minimumComparableOccasions,
    days: goldenHoursThresholds.minimumDistinctDays,
  },
  start_friction: {
    occasions: startFrictionThresholds.minimumComparableOccasions,
    days: startFrictionThresholds.minimumDistinctDays,
  },
  escape_hatch: {
    occasions: escapeHatchThresholds.minimumComparableOccasions,
    days: escapeHatchThresholds.minimumDistinctDays,
  },
  planned_vs_actual: {
    occasions: plannedActualThresholds.minimumComparableOccasions,
    days: plannedActualThresholds.minimumDistinctDays,
  },
};

/**
 * Durable analytical state machine (§5–§6).
 *
 * RUNNING beats everything (a retry may be in flight). Otherwise the latest
 * terminal run wins; SUPERSEDED-only history means NO_RUN (safe to re-run).
 * COMPLETED reuses the pipeline's own presentation state (ok / no-findings /
 * insufficient-evidence / ...) so completed outcomes keep their exact meaning.
 */
export async function getPersistedPatterns(userId: string, window: AnalyticalWindow): Promise<PersistedPatternsResponse> {
  const db = getDb();
  const whereWindow = {
    userId,
    windowStart: new Date(window.start),
    windowEnd: new Date(window.end),
  };
  const [running, completed, failed] = await Promise.all([
    db.patternAnalysisRun.findFirst({
      where: { ...whereWindow, status: "RUNNING" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, updatedAt: true },
    }),
    db.patternAnalysisRun.findFirst({
      where: { ...whereWindow, status: "COMPLETED" },
      orderBy: { computedAt: "desc" },
    }),
    db.patternAnalysisRun.findFirst({
      where: { ...whereWindow, status: "FAILED" },
      orderBy: { computedAt: "desc" },
    }),
  ]);
  const preferences = await db.userPreference.findUnique({ where: { userId } });
  const history = await readRecordingHistory(userId, preferences?.timezone ?? "UTC");
  const activity: PatternReadiness["activity"] = history.recordedDays > 0 ? "recorded" : "none";

  if (running) {
    return {
      state: "RUNNING", runStatus: "RUNNING", runId: running.id, computedAt: null,
      window, patterns: [], earlySignals: [], diagnostics: emptyDiagnostics(),
      readiness: { activity, evidence: "unknown", analysis: "running", patterns: "unknown" },
    };
  }
  if (completed) {
    const findings = await db.patternFinding.findMany({
      where: { runId: completed.id },
      orderBy: { patternId: "asc" },
    });
    const patterns = findings.map((f) => f.resultJson as unknown as BehavioralPatternOutput);
    const diagnostics = (completed.diagnosticsJson ?? emptyDiagnostics()) as unknown as PatternsResponse["diagnostics"];
    // Detector-aware sufficiency (§10): an available detector meets ITS OWN
    // configured minimum occasions AND days. NOT_AVAILABLE detectors (D4) and
    // below-bar counts never qualify as "sufficient".
    const evidence: PatternReadiness["evidence"] = diagnostics.perDetector.some((d) => {
      if (d.availability === "NOT_AVAILABLE") return false;
      const bar = EVIDENCE_BAR[d.identity];
      if (!bar) return false;
      return (d.eligibleOccasions ?? 0) >= bar.occasions && (d.eligibleDays ?? 0) >= bar.days;
    }) ? "sufficient" : "insufficient";
    return {
      state: (completed.state ?? "ok") as PatternsState, runStatus: "COMPLETED",
      runId: completed.id, computedAt: completed.computedAt?.toISOString() ?? null,
      window, patterns, earlySignals: earlySignalsFor((completed.state ?? "ok") as PatternsState, diagnostics),
      diagnostics,
      readiness: { activity, evidence, analysis: "completed", patterns: patterns.length > 0 ? "found" : "none" },
    };
  }
  if (failed) {
    return {
      state: "FAILED", runStatus: "FAILED", runId: failed.id,
      computedAt: failed.computedAt?.toISOString() ?? null,
      window, patterns: [], earlySignals: [], diagnostics: emptyDiagnostics(),
      readiness: { activity, evidence: "unknown", analysis: "failed", patterns: "unknown" },
    };
  }
  return {
    state: "NO_RUN", runStatus: "NO_RUN", runId: null, computedAt: null,
    window, patterns: [], earlySignals: [], diagnostics: emptyDiagnostics(),
    readiness: { activity, evidence: "unknown", analysis: "never", patterns: "unknown" },
    analysisBlocked: await blockedAnalysis(userId),
  };
}

/**
 * Sync-path task mapping (Fix 4b): the legacy `{id, completedAt}` projection
 * starved D4/D6/D7/D8 of plans even when they exist. Planned fields pass
 * through verbatim (null stays null — never inferred) so the sync path
 * matches the worker provider.
 */
function mapSyncTasks(tasks: Data["tasks"]) {
  return tasks.map((task) => ({
    id: task.id,
    completedAt: task.completedAt?.toISOString() ?? null,
    plannedStart: task.plannedStart?.toISOString() ?? null,
    plannedDurationMinutes: task.plannedDurationMinutes,
  }));
}

export async function runPatternPipeline(userId: string, window: AnalyticalWindow): Promise<PatternsResponse> {
  const data = await readData(userId, window);
  return evaluatePatterns({
    ...data,
    tasks: mapSyncTasks(data.tasks),
  });
}

function insightContentHash(userId: string, window: AnalyticalWindow, insight: InsightOutput): string {
  const patternIds = insight.inputs
    .flatMap((ref) => ("patternId" in ref && ref.patternId ? [ref.patternId] : []))
    .sort();
  return createHash("sha256")
    .update(JSON.stringify([userId, window.start, window.end, insight.status, insight.claim, patternIds]))
    .digest("hex");
}

/**
 * Phase 6 durability: persists DETECTED insights as immutable rows,
 * deduplicated by content hash so re-running a window never duplicates.
 * Guarded for clients without the Insight model (older generated clients,
 * unit fakes) — returns 0 instead of throwing.
 */
export async function persistInsightsForWindow(
  userId: string,
  window: AnalyticalWindow,
  insights: InsightOutput[],
  createdFromRunId: string | null = null
): Promise<number> {
  const client = getDb() as any;
  if (typeof client.insight?.findFirst !== "function") return 0;
  let written = 0;
  for (const insight of insights) {
    if (insight.status !== "DETECTED") continue;
    const contentHash = insightContentHash(userId, window, insight);
    const existing = await client.insight.findFirst({
      where: { userId, contentHash },
      select: { id: true },
    });
    if (existing) continue;
    const patternIds = [
      ...new Set(
        insight.inputs.flatMap((ref) => ("patternId" in ref && ref.patternId ? [ref.patternId] : []))
      ),
    ].sort();
    await client.insight.create({
      data: {
        userId,
        windowStart: new Date(window.start),
        windowEnd: new Date(window.end),
        contentHash,
        patternIds,
        claim: insight.claim,
        claimLevel: insight.claimLevel,
        headline: insight.headline ?? null,
        supportingLine: insight.supportingLine ?? null,
        status: insight.status,
        createdFromRunId,
      },
    });
    written++;
  }
  return written;
}

export async function runInsightPipeline(userId: string, window: AnalyticalWindow): Promise<InsightsResponse> {
  const data = await readData(userId, window);
  const result = evaluatePatterns({
    ...data,
    tasks: mapSyncTasks(data.tasks),
  });
  const reflections: ReflectionInput[] = data.reports.flatMap((report) => {
    if (!report.windowStart || !report.windowEnd || !overlaps(report.windowStart, report.windowEnd, window)) return [];
    const energy = report.energy;
    const focus = report.focus;
    return [{ recordId: report.id, date: resolveProductiveDay(report.windowStart, { timezone: data.timezone }),
      ...(energy === "low" || energy === "medium" || energy === "high" ? { reportedEnergy: energy } : {}),
      // FocusLevel vocabulary only: any other stored string stays unmapped so
      // analytics fail-closed validation never poisons the whole composition.
      ...(focus === "scattered" || focus === "mixed" || focus === "focused" ? { reportedFocus: focus } : {}),
      ...(typeof report.progress === "boolean" ? { reportedProgress: report.progress } : {}),
      ...(report.blocker ? { blockers: [report.blocker] } : {}),
      // Context key uses the pipeline's own qualification convention
      // (`task:<id>`, see continuousCandidate/contextSwitchingCandidate) so
      // the analytics shared-context check can match. Reports without a
      // linked task carry no key and fail closed downstream — never guessed.
      ...(report.taskId ? { contextKey: `task:${report.taskId}` } : {}),
      window: { start: new Date(report.windowStart).toISOString(), end: new Date(report.windowEnd).toISOString() },
    }];
  });
  const inputs = (result.patterns as any[]).map((pattern) => ({ patterns: [{ pattern }], reflections, outcomes: data.outcomes, window }));
  const composed = composeInsights(inputs.length ? inputs : [{ patterns: [], reflections, outcomes: data.outcomes, window }]);
  const insights = composed.filter((insight) => insight.status === "DETECTED");
  // Phase 6 durability: persist DETECTED insights (hash-deduped) so they
  // survive beyond this response. Best-effort by design — persistence must
  // never fail the read.
  try {
    await persistInsightsForWindow(userId, window, insights);
  } catch (err) {
    console.error("[Insights] persistence failed, serving computed result:", err instanceof Error ? err.message : String(err));
  }
  return { state: insights.length ? "ok" : result.state === "ok" || result.state === "no-findings" ? "no-findings" : result.state,
    window, insights, diagnostics: result.diagnostics };
}
