import type {
  AnalyticalWindow, BehavioralPatternOutput, CheckIn, EpisodeMeasurementOutput, EvidenceTimeline, InsightOutput,
  PatternEvidenceRef, WorkSession,
} from "@repo/types";
import { resolveProductiveDay } from "@repo/types";
import {
  composeInsights, configureDetectorCatalogEntry, ContinuousActivityDetector, countDistinctCalendarDays,
  evaluateContextSwitchingEpisode, evaluateContextSwitchingPattern, evaluateTaskFragmentationEpisode,
  evaluateTaskFragmentationPattern, initializeProvisionalReliability, median,
  promotePattern, ScheduleVarianceDetector, segmentTaskExecutionEpisodes, subtractCalendarDays,
  type ContextSwitchingMetrics, type ContinuousActivityMetrics, type DetectorIdentity, type OutcomeInput,
  type PatternPromotionInput, type ReflectionInput, type TaskExecutionFragmentationMetrics,
} from "@repo/analytics";
import { getDb } from "../../lib/prisma";
import { activityInRange } from "../activity/service";
import { listCheckIns } from "../check-ins/service";
import { listSessions } from "../sessions/service";
import { assembleEvidence, compare, overlaps, stableId, timelineFromBlocks } from "./evidence";
import { contextConfig, continuousConfig, continuousThresholds, episodeContext, fragmentationConfig, patternContext, scheduleConfig } from "./support";

export type PatternsState = "not-connected" | "no-observations" | "insufficient-evidence" | "no-findings" | "ok";
export interface DetectorDiagnostics {
  identity: DetectorIdentity;
  status: string;
  reason?: string;
  eligibleOccasions: number;
  eligibleDays: number;
  meanCoverageRatio: number | null;
}
export interface RecordingHistory {
  firstObservationAt: string | null;
  lastObservationAt: string | null;
  recordedDays: number;
  connected: boolean;
}
export interface PatternsResponse {
  state: PatternsState;
  window: AnalyticalWindow;
  patterns: BehavioralPatternOutput[];
  diagnostics: { perDetector: DetectorDiagnostics[]; recordingHistory?: RecordingHistory };
}
export interface InsightsResponse {
  state: PatternsState;
  window: AnalyticalWindow;
  insights: InsightOutput[];
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
  tasks: Array<{ id: string; completedAt: Date | null }>;
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
    db.task.findMany({ where: { userId }, select: { id: true, completedAt: true } }),
    db.dailyGoal.findMany({ where: { userId, plan: { date: { gte: resolveProductiveDay(window.start, { timezone }), lte: resolveProductiveDay(window.end, { timezone }) } } },
      select: { id: true, outcome: true, plan: { select: { date: true } } } }),
    db.normalizedActivity.count({ where: { userId } }),
    readRecordingHistory(userId, timezone),
    db.desktopDevice.count({ where: { userId } }), db.browserInstallation.count({ where: { userId } }),
  ]);
  sessions.sort((a, b) => compare(a.startedAt, b.startedAt) || compare(a.id, b.id));
  reports.sort((a, b) => compare(a.id, b.id));
  tasks.sort((a, b) => compare(a.id, b.id));
  const outcomes: OutcomeInput[] = goals.flatMap<OutcomeInput>((goal) => {
    const outcome = goal.outcome;
    return outcome === "ACHIEVED" || outcome === "PARTIALLY_ACHIEVED" || outcome === "NOT_ACHIEVED"
      ? [{ recordId: goal.id, date: goal.plan.date, goalOutcome: outcome }] : [];
  }).sort((a, b) => compare(a.recordId, b.recordId));
  return {
    userId, timezone, boundary: preferences?.dayBoundary ?? "00:00", window, baselineWindow, sessions, reports, tasks, outcomes,
    timeline: assembleEvidence(userId, window, events, sessions, reports),
    baseline: assembleEvidence(userId, baselineWindow, events, sessions, reports),
    connected: desktopCount + browserCount + activityCount > 0,
    recordingHistory: { ...recordingHistory, connected: desktopCount + browserCount > 0 },
  };
}

function closedSessions(data: Data, window: AnalyticalWindow) {
  return data.sessions.filter((session) => session.source === "manual" && session.endedAt && !session.isPaused &&
    Date.parse(session.startedAt) >= Date.parse(window.start) && Date.parse(session.endedAt) <= Date.parse(window.end) &&
    Date.parse(session.endedAt) > Date.parse(session.startedAt) &&
    resolveProductiveDay(session.startedAt, { timezone: data.timezone }) ===
      resolveProductiveDay(Date.parse(session.endedAt) - 1, { timezone: data.timezone }) &&
    !data.sessions.some((other) => other.id !== session.id && other.source === "manual" && other.endedAt &&
      overlaps(other.startedAt, other.endedAt, { start: session.startedAt, end: session.endedAt! })));

}

function sessionEpisodes(data: Data, timeline: EvidenceTimeline) {
  const window = { start: timeline.windowStart, end: timeline.windowEnd };
  const continuous = new ContinuousActivityDetector(continuousConfig);
  return closedSessions(data, window).map((session) => {
    const bounded = timelineFromBlocks({ start: session.startedAt, end: session.endedAt! }, timeline.blocks);
    const context = episodeContext(data.userId, data.timezone, bounded, "extended_continuous_activity", session.id, session.taskId ?? undefined, data.window.end);
    const d3 = continuous.evaluateEpisode(context, stableId("D3", session.id));
    const d1Context = episodeContext(data.userId, data.timezone, bounded, "context_switching_density", session.id, session.taskId ?? undefined, data.window.end);
    const d1 = evaluateContextSwitchingEpisode(d1Context, stableId("D1", session.id),
      { ...session, durationSeconds: bounded.totalDurationSeconds }, bounded.blocks, contextConfig);
    return { session, d1, d3, bounded };
  });
}

function taskEpisodes(data: Data, timeline: EvidenceTimeline): EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[] {
  const window = { start: timeline.windowStart, end: timeline.windowEnd };
  return data.tasks.flatMap((task) => segmentTaskExecutionEpisodes(timeline.blocks, task.id, {
    continuationGapThresholdSeconds: fragmentationConfig.continuationGapThresholdSeconds,
    timezone: data.timezone, window, completedAt: task.completedAt?.toISOString(),
  }).map((episode) => {
    const bounded = timelineFromBlocks({ start: episode.startedAt, end: episode.endedAt }, timeline.blocks);
    const context = episodeContext(data.userId, data.timezone, bounded, "task_execution_fragmentation",
      stableId(task.id, episode.startedAt), task.id, data.window.end);
    return evaluateTaskFragmentationEpisode(context, stableId("D2", task.id, episode.startedAt), bounded.blocks, fragmentationConfig, task.id);
  }));
}

function diagnostic(identity: DetectorIdentity, result: BehavioralPatternOutput<unknown>, reason: string): DetectorDiagnostics {
  return {
    identity, status: result.executionStatus, reason,
    eligibleOccasions: result.sample.qualifyingEpisodes, eligibleDays: result.sample.qualifyingDays,
    meanCoverageRatio: result.sample.qualifyingEpisodes ? result.sample.meanCoverageRatio : null,
  };
}

type SessionEpisode = ReturnType<typeof sessionEpisodes>[number];

function continuousCandidate(data: Data, taskId: string, current: SessionEpisode[], historical: SessionEpisode[]): PatternPromotionInput {
  const entry = configureDetectorCatalogEntry("extended_continuous_activity", continuousThresholds);
  const qualified = current.filter((item) => item.d3.executionStatus === "QUALIFIED");
  const history = historical.filter((item) => item.d3.executionStatus === "QUALIFIED");
  const days = (items: SessionEpisode[]) => countDistinctCalendarDays(items.map((item) => item.session.startedAt), data.timezone);
  const currentValue = median(qualified.map((item) => item.d3.metrics.observedDurationSeconds));
  const baselineValue = median(history.map((item) => item.d3.metrics.observedDurationSeconds));
  const contrast = currentValue !== null && baselineValue !== null ? currentValue - baselineValue : null;
  const coverage = qualified.length ? qualified.reduce((sum, item) => sum + item.d3.coverageRatio, 0) / qualified.length : 0;
  const unknown = qualified.length ? qualified.reduce((sum, item) => sum + item.d3.metrics.unknownFraction, 0) / qualified.length : 1;
  const sufficient = qualified.length >= continuousThresholds.minimumComparableOccasions && days(qualified) >= continuousThresholds.minimumDistinctDays;
  const mature = history.length >= continuousThresholds.minimumBaselineOccasions && days(history) >= continuousThresholds.minimumBaselineDays;
  const supportsDirection = qualified.filter((item) => baselineValue !== null && contrast !== null &&
    (contrast > 0 ? item.d3.metrics.observedDurationSeconds - baselineValue >= continuousThresholds.minimumAbsoluteContrast
      : baselineValue - item.d3.metrics.observedDurationSeconds >= continuousThresholds.minimumAbsoluteContrast)).length;
  const detected = contrast !== null && Math.abs(contrast) >= continuousThresholds.minimumAbsoluteContrast && supportsDirection / qualified.length >= 2 / 3;
  const evidenceRefs: PatternEvidenceRef[] = qualified.map((item) => ({
    occasionId: item.session.id, date: resolveProductiveDay(item.session.startedAt, { timezone: data.timezone }),
    window: { start: item.session.startedAt, end: item.session.endedAt! },
    blockIds: item.d3.metrics.blockIds, sessionIds: [item.session.id], taskIds: [taskId],
    reportIds: data.reports.filter((report) => report.windowStart && report.windowEnd && overlaps(report.windowStart, report.windowEnd,
      { start: item.session.startedAt, end: item.session.endedAt! })).map((report) => report.id).sort(),
  }));
  const resultId = stableId(data.userId, "D3", taskId, data.window);
  const sample = { qualifyingEpisodes: qualified.length, qualifyingDays: days(qualified),
    totalObservedHours: qualified.reduce((sum, item) => sum + item.d3.activeDurationSeconds, 0) / 3600, meanCoverageRatio: coverage };
  const caveats = [
    "Prototype thresholds are configurable product policy, not calibrated confidence.",
    "Comparison is limited to closed, explicitly linked sessions for the same task; it is not a day-level comparison.",
    "Coverage uses each full session span; only the longest observed run contributes duration. No gaps are bridged.",
    "Session bounds come from the existing session read path; historical pause intervals and machine availability are unavailable.",
    "Evidence blocks are computed on demand, not persisted timeline block IDs.",
    "A same-task session declaration does not prove that every observed action served that task.",
  ];
  return {
    metadata: { evaluationId: resultId, patternId: resultId, detectorVersion: "1.0.0", configurationVersion: "api-prototype-1", generatedAt: data.window.end },
    userId: data.userId, detectorIdentity: "extended_continuous_activity", patternType: "extended_continuous_activity", role: "primary", resultId,
    taxonomy: "sustained_effort", level: "PATTERN", attributionMode: "TASK_LINKED",
    executionStatus: !sufficient ? "INSUFFICIENT_EVIDENCE" : !mature ? "INSUFFICIENT_BASELINE_DATA" : detected ? "DETECTED" : "NO_PATTERN",
    temporalWindow: { ...data.window, scale: "30_DAY" }, sample,
    baseline: { strategy: "PERSONAL_30_DAY", comparedMetric: "observedDurationSeconds", baselineValue, currentValue,
      deltaRatio: null, comparisonStatus: mature ? "EVALUATED" : "INSUFFICIENT_BASELINE_DATA" },
    metrics: {
      medianObservedDurationSeconds: currentValue, baselineMedianObservedDurationSeconds: baselineValue,
      contrastSeconds: contrast, supportingOccasions: supportsDirection,
      occasions: current.map((item) => ({ sessionId: item.session.id, status: item.d3.executionStatus, ...item.d3.metrics })),
      baselineOccasions: history.map((item) => ({ sessionId: item.session.id, window: { start: item.session.startedAt, end: item.session.endedAt }, ...item.d3.metrics })),
    },
    reliability: initializeProvisionalReliability({ qualifyingDayCount: days(qualified), qualifyingEpisodeCount: qualified.length,
      meanTelemetryCoverageRatio: coverage, baselineMaturityDays: days(history), hasCorroboratingSelfReport: evidenceRefs.some((ref) => ref.reportIds.length > 0) }),
    evidenceReferences: { contributingSessionIds: qualified.map((item) => item.session.id).sort(), contributingTaskIds: [taskId], sampleBoundingWindows: evidenceRefs.map((ref) => ref.window) },
    epistemicCaveats: caveats, caveats,
    claim: contrast !== null && contrast < 0 ? "Longest observed stretches in same-task sessions were shorter than earlier records." : "Longest observed stretches in same-task sessions were longer than earlier records.",
    claimLevel: "sustained-change", repertoireCategory: "changed",
    comparison: { referenceKind: "own-history", window: data.baselineWindow, comparabilityNote: "Closed manual sessions explicitly linked to the same task; identical measurement and coverage rules in both windows." },
    eligibility: { required: { ...continuousThresholds, minimumDirectionalShare: 2 / 3 }, observed: {},
      excluded: current.filter((item) => item.d3.executionStatus !== "QUALIFIED").map((item) => ({ occasionId: item.session.id, reason: item.d3.executionStatus })) },
    contributingResults: [{ detectorIdentity: "extended_continuous_activity", resultId, metricsUsed: ["observedDurationSeconds", "evaluationWindowSeconds"], role: "primary" }],
    evidenceRefs,
    qualification: {
      validity: { windowsClipped: true, coverageDenominatorDisclosed: true, observedSpanSeparated: true, metricQualifiedBaseline: mature },
      context: { kind: "workstream", key: `task:${taskId}`, description: "Closed sessions explicitly linked to the same task." },
      contrast: { size: contrast ?? 0, direction: contrast === null || contrast === 0 ? "unchanged" : contrast > 0 ? "increased" : "decreased" },
      unknownFraction: unknown, baselineSample: { comparableOccasions: history.length, distinctDays: days(history) }, userQuestion: entry.userQuestions[0]!,
    },
  };
}

async function evaluate(data: Data) {
  const current = sessionEpisodes(data, data.timeline);
  const historical = sessionEpisodes(data, data.baseline);
  const d1 = evaluateContextSwitchingPattern(patternContext(data.userId, data.timezone, data.timeline, "context_switching_density", data.window.end),
    stableId("D1", data.window), stableId("D1-pattern", data.window), current.map((item) => item.d1), historical.map((item) => ({
      sessionId: item.session.id, userId: data.userId, startedAt: item.session.startedAt, endedAt: item.session.endedAt!,
      activeDurationSeconds: item.d1.activeDurationSeconds, coverageRatio: item.d1.coverageRatio, switchesPerHour: item.d1.metrics.switchesPerHour,
    })), contextConfig);
  const currentTasks = taskEpisodes(data, data.timeline);
  const historyTasks = taskEpisodes(data, data.baseline);
  const d2 = evaluateTaskFragmentationPattern(patternContext(data.userId, data.timezone, data.timeline, "task_execution_fragmentation", data.window.end),
    stableId("D2", data.window), stableId("D2-pattern", data.window), currentTasks, historyTasks.map((episode) => ({
      ...episode.metrics, episodeId: episode.metadata.evaluationId, userId: data.userId,
      startedAt: episode.temporalWindow.start, endedAt: episode.temporalWindow.end, coverageRatio: episode.coverageRatio,
    })), fragmentationConfig);
  const d4 = new ScheduleVarianceDetector(scheduleConfig).evaluatePatternWithInstances(
    patternContext(data.userId, data.timezone, data.timeline, "schedule_variance", data.window.end),
    stableId("D4", data.window), stableId("D4-pattern", data.window),
    [],
  );
  const diagnostics: DetectorDiagnostics[] = [
    diagnostic("context_switching_density", d1, "Changes between recorded software contexts are evaluated alongside other findings."),
    diagnostic("task_execution_fragmentation", d2, "More earlier comparable work and baseline history are needed for this comparison."),
    diagnostic("schedule_variance", d4, "Saved plans from before work began (snapshots) are missing."),
  ];
  const taskIds = [...new Set(current.flatMap((item) => item.session.taskId ? [item.session.taskId] : []))].sort();
  const patterns: PatternPromotionInput[] = [];
  const d3Diagnostics: DetectorDiagnostics[] = [];
  let qualifiedEvaluation = false;
  const d3Reason = (candidate: PatternPromotionInput, promoted: boolean, occasions: SessionEpisode[]) => {
    if (promoted) return "A change was found across comparable same-task sessions.";
    if (candidate.executionStatus === "NO_PATTERN") return "No change was found across comparable same-task occasions.";
    if (occasions.some((item) => item.d3.coverageRatio < continuousConfig.minimumCoverageRatio ||
      item.d3.metrics.unknownFraction > continuousConfig.maxUnknownFraction)) {
      return "Some periods do not have enough recorded activity or telemetry coverage to compare.";
    }
    return "More earlier comparable work is needed for this comparison.";
  };
  for (const taskId of taskIds) {
    const candidate = continuousCandidate(data, taskId, current.filter((item) => item.session.taskId === taskId), historical.filter((item) => item.session.taskId === taskId));
    const promoted = promotePattern(candidate, configureDetectorCatalogEntry("extended_continuous_activity", continuousThresholds), data.window);
    if (promoted.promoted) patterns.push(promoted.pattern);
    if (candidate.executionStatus === "NO_PATTERN") qualifiedEvaluation = true;
    d3Diagnostics.push(diagnostic("extended_continuous_activity", candidate,
      d3Reason(candidate, promoted.promoted, current.filter((item) => item.session.taskId === taskId))));
  }
  const d3Eligible = current.filter((item) => item.session.taskId && item.d3.executionStatus === "QUALIFIED");
  diagnostics.push({ identity: "extended_continuous_activity", status: patterns.length ? "PROMOTED" : qualifiedEvaluation ? "NO_PATTERN" : "INSUFFICIENT_EVIDENCE",
    reason: d3Diagnostics.length ? [...new Set(d3Diagnostics.map((item) => item.reason))].join(" ") : "No closed task-linked sessions are available for comparison.",
    eligibleOccasions: d3Eligible.length, eligibleDays: countDistinctCalendarDays(d3Eligible.map((item) => item.session.startedAt), data.timezone),
    meanCoverageRatio: d3Eligible.length ? d3Eligible.reduce((sum, item) => sum + item.d3.coverageRatio, 0) / d3Eligible.length : null });
  const hasObservations = data.timeline.blocks.some((block) => block.observation !== null);
  const state: PatternsState = patterns.length ? "ok" : !hasObservations ? data.connected ? "no-observations" : "not-connected"
    : qualifiedEvaluation ? "no-findings" : "insufficient-evidence";
  return { state, window: data.window, patterns: patterns.sort((a, b) => compare(a.metadata.patternId, b.metadata.patternId)),
    diagnostics: { perDetector: diagnostics.sort((a, b) => compare(a.identity, b.identity)), recordingHistory: data.recordingHistory } };
}

export async function runPatternPipeline(userId: string, window: AnalyticalWindow): Promise<PatternsResponse> {
  return evaluate(await readData(userId, window));
}

export async function runInsightPipeline(userId: string, window: AnalyticalWindow): Promise<InsightsResponse> {
  const data = await readData(userId, window);
  const result = await evaluate(data);
  const reflections: ReflectionInput[] = data.reports.flatMap((report) => {
    if (!report.windowStart || !report.windowEnd || !overlaps(report.windowStart, report.windowEnd, window)) return [];
    const energy = report.energy;
    return [{ recordId: report.id, date: resolveProductiveDay(report.windowStart, { timezone: data.timezone }),
      ...(energy === "low" || energy === "medium" || energy === "high" ? { reportedEnergy: energy } : {}),
      ...(report.blocker ? { blockers: [report.blocker] } : {}),
    }];
  });
  const inputs = result.patterns.map((pattern) => ({ patterns: [{ pattern }], reflections, outcomes: data.outcomes, window }));
  const composed = composeInsights(inputs.length ? inputs : [{ patterns: [], reflections, outcomes: data.outcomes, window }]);
  const insights = composed.filter((insight) => insight.status === "DETECTED");
  return { state: insights.length ? "ok" : result.state === "ok" || result.state === "no-findings" ? "no-findings" : result.state,
    window, insights, diagnostics: result.diagnostics };
}
