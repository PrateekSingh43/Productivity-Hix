/**
 * Pattern analysis pipeline (pure orchestration).
 *
 * Moved verbatim from `apps/api/src/services/patterns/service.ts` so the API
 * and the PatternWorker share one deterministic implementation. No thresholds,
 * semantics, or copy were changed in the move.
 *
 * epistemic boundary: Observation (evidence timelines in) -> Pattern (promoted
 * findings out). No Insight composition here; that stays API-side.
 */
import type {
  AnalyticalWindow,
  BehavioralPatternOutput,
  CheckIn,
  EpisodeMeasurementOutput,
  EvidenceTimeline,
  PatternEvidenceRef,
  WorkSession,
} from "@repo/types";
import { resolveProductiveDay } from "@repo/types";
import {
  ContinuousActivityDetector,
  countDistinctCalendarDays,
  evaluateContextSwitchingEpisode,
  evaluateContextSwitchingPattern,
  evaluateTaskFragmentationEpisode,
  evaluateTaskFragmentationPattern,
  initializeProvisionalReliability,
  median,
  promotePattern,
  ScheduleVarianceDetector,
  segmentTaskExecutionEpisodes,
  subtractCalendarDays,
  configureDetectorCatalogEntry,
  type ContextSwitchingMetrics,
  type ContinuousActivityMetrics,
  type DetectorIdentity,
  type PatternPromotionInput,
  type TaskExecutionFragmentationMetrics,
  type OutcomeInput,
} from "../index";
import { PatternExecutionContext, type PatternLevelExecutionContext, type EpisodeExecutionContext } from "./base/context";
import type { ContextSwitchingConfig } from "./detectors/context-switching/types";
import type { TaskFragmentationConfig } from "./detectors/task-fragmentation/types";
import { stableId, compare, overlaps, timelineFromBlocks } from "./evidence-assembler";

export const PATTERN_ENGINE_VERSION = "1.0.0";
export const PATTERN_CONFIG_VERSION = "api-prototype-1";

export type PatternsState = "not-connected" | "no-observations" | "insufficient-evidence" | "no-findings" | "ok" | "pending";

export type DetectorAvailability = "AVAILABLE" | "NOT_AVAILABLE";

export interface DetectorDiagnostics {
  identity: DetectorIdentity;
  status: string;
  reason?: string;
  eligibleOccasions: number;
  eligibleDays: number;
  meanCoverageRatio: number | null;
  /**
   * Whether the detector could actually evaluate. NOT_AVAILABLE means required
   * upstream input does not exist (missing infrastructure), which is NOT the
   * same as evaluating and finding nothing.
   */
  availability: DetectorAvailability;
}

export interface RecordingHistory {
  firstObservationAt: string | null;
  lastObservationAt: string | null;
  recordedDays: number;
  connected: boolean;
}

export interface PatternPipelineInput {
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
  tasks: Array<{ id: string; completedAt: string | null }>;
  connected: boolean;
  recordingHistory: RecordingHistory;
}

export interface PatternPipelineResult {
  state: PatternsState;
  window: AnalyticalWindow;
  patterns: PatternPromotionInput[];
  diagnostics: { perDetector: DetectorDiagnostics[]; recordingHistory?: RecordingHistory };
}

// ---------------------------------------------------------------------------
// Detector configuration (product policy, moved verbatim from API support.ts)
// ---------------------------------------------------------------------------

export const contextConfig: ContextSwitchingConfig = {
  minimumEpisodeActiveDurationSeconds: 1800, minimumUsableCoverageRatio: 0.85, shortContextThresholdSeconds: 30,
  minimumQualifyingSessions: 5, minimumQualifyingCalendarDays: 3, minimumBaselineDays: 3, minimumBaselineSessions: 5,
  switchContrastThreshold: 0.5, absoluteElevatedSwitchThreshold: 6, switchRecurrenceThreshold: 0.6, minimumPatternCoverageRatio: 0.85,
};
export const fragmentationConfig: TaskFragmentationConfig = {
  continuationGapThresholdSeconds: 7200, maxUnknownFraction: 0.2, minimumEpisodeActiveDurationSeconds: 600,
  minimumQualifyingEpisodes: 3, minimumQualifyingCalendarDays: 2, minimumBaselineDays: 30,
  minimumBaselineEpisodes: 5, minimumBaselineDistinctDays: 3, fragmentationContrastThreshold: 0.3,
  fragmentationRecurrenceThreshold: 0.6, minimumPatternCoverageRatio: 0.8,
};
export const continuousConfig = {
  minimumEpisodeDurationSeconds: 600, maximumContinuityGapSeconds: 0, minimumCoverageRatio: 0.8,
  maxUnknownFraction: 0.2, detectorVersion: "1.0.0", configurationVersion: PATTERN_CONFIG_VERSION,
};
export const continuousThresholds = {
  minimumComparableOccasions: 3, minimumDistinctDays: 3, minimumCoverageRatio: 0.8, maximumUnknownFraction: 0.2,
  minimumBaselineOccasions: 3, minimumBaselineDays: 3, minimumAbsoluteContrast: 600,
};
export const scheduleConfig = {
  onTimeToleranceSeconds: 0, minimumQualifyingTaskInstances: 5, minimumDistinctCalendarDays: 3,
  minimumPatternCoverageRatio: 0.8, delayedStartFractionThreshold: 0.5,
  detectorVersion: "1.0.0", configurationVersion: "api-snapshot-unavailable-1",
};

// ---------------------------------------------------------------------------
// Execution contexts
// ---------------------------------------------------------------------------

export function executionContext(userId: string, timezone: string, timeline: EvidenceTimeline, identity: DetectorIdentity) {
  return new PatternExecutionContext({
    userId, timezone, timeline, level: "PATTERN",
    config: {
      detectorIdentity: identity, detectorVersion: PATTERN_ENGINE_VERSION, configurationVersion: PATTERN_CONFIG_VERSION,
      baselineStrategy: "PERSONAL_30_DAY", attributionMode: "TASK_LINKED",
      sufficiency: {
        requiredEvidenceQuality: { allowReportedOnly: false, allowExplainedGap: false, maxUnknownFraction: 0.2 },
        unknownHandling: "INDETERMINATE_IF_EXCEEDED",
      },
    },
  });
}

export function patternContext(userId: string, timezone: string, timeline: EvidenceTimeline, identity: DetectorIdentity, generatedAt: string): PatternLevelExecutionContext {
  const context = executionContext(userId, timezone, timeline, identity);
  return { ...context, level: "PATTERN", generateOperationalMetadata: () => ({
    detectorVersion: context.config.detectorVersion, configurationVersion: context.config.configurationVersion, generatedAt,
  }) };
}

export function episodeContext(userId: string, timezone: string, timeline: EvidenceTimeline, identity: DetectorIdentity,
  sessionId: string, taskId: string | undefined, generatedAt: string): EpisodeExecutionContext {
  const context = patternContext(userId, timezone, timeline, identity, generatedAt);
  return { ...context, level: "EPISODE", canonicalSessionId: sessionId, targetTaskId: taskId,
    generateOperationalMetadata: () => context.generateOperationalMetadata() };
}
function closedSessions(data: PatternPipelineInput, window: AnalyticalWindow) {
  return data.sessions.filter((session) => session.source === "manual" && session.endedAt && !session.isPaused &&
    Date.parse(session.startedAt) >= Date.parse(window.start) && Date.parse(session.endedAt) <= Date.parse(window.end) &&
    Date.parse(session.endedAt) > Date.parse(session.startedAt) &&
    resolveProductiveDay(session.startedAt, { timezone: data.timezone }) ===
      resolveProductiveDay(Date.parse(session.endedAt) - 1, { timezone: data.timezone }) &&
    !data.sessions.some((other) => other.id !== session.id && other.source === "manual" && other.endedAt &&
      overlaps(other.startedAt, other.endedAt, { start: session.startedAt, end: session.endedAt! })));

}

function sessionEpisodes(data: PatternPipelineInput, timeline: EvidenceTimeline) {
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

function taskEpisodes(data: PatternPipelineInput, timeline: EvidenceTimeline): EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[] {
  const window = { start: timeline.windowStart, end: timeline.windowEnd };
  return data.tasks.flatMap((task) => segmentTaskExecutionEpisodes(timeline.blocks, task.id, {
    continuationGapThresholdSeconds: fragmentationConfig.continuationGapThresholdSeconds,
    timezone: data.timezone, window, completedAt: task.completedAt ?? undefined,
  }).map((episode) => {
    const bounded = timelineFromBlocks({ start: episode.startedAt, end: episode.endedAt }, timeline.blocks);
    const context = episodeContext(data.userId, data.timezone, bounded, "task_execution_fragmentation",
      stableId(task.id, episode.startedAt), task.id, data.window.end);
    return evaluateTaskFragmentationEpisode(context, stableId("D2", task.id, episode.startedAt), bounded.blocks, fragmentationConfig, task.id);
  }));
}

function diagnostic(
  identity: DetectorIdentity,
  result: BehavioralPatternOutput<unknown>,
  reason: string,
  availability: DetectorAvailability = "AVAILABLE",
): DetectorDiagnostics {
  return {
    identity, status: result.executionStatus, reason,
    eligibleOccasions: result.sample.qualifyingEpisodes, eligibleDays: result.sample.qualifyingDays,
    meanCoverageRatio: result.sample.qualifyingEpisodes ? result.sample.meanCoverageRatio : null,
    availability,
  };
}

type SessionEpisode = ReturnType<typeof sessionEpisodes>[number];

function continuousCandidate(data: PatternPipelineInput, taskId: string, current: SessionEpisode[], historical: SessionEpisode[]): PatternPromotionInput {
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

export function evaluatePatterns(data: PatternPipelineInput): PatternPipelineResult {
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
  // D4 input contract (§13 State B): no plan/schedule snapshot provider exists, so
  // the detector is deliberately NOT fed real instances. Passing [] would
  // masquerade missing infrastructure as a legitimate "no finding", therefore
  // the diagnostic is explicitly marked NOT_AVAILABLE. Detector untouched.
  const d4 = new ScheduleVarianceDetector(scheduleConfig).evaluatePatternWithInstances(
    patternContext(data.userId, data.timezone, data.timeline, "schedule_variance", data.window.end),
    stableId("D4", data.window), stableId("D4-pattern", data.window),
    [],
  );
  const diagnostics: DetectorDiagnostics[] = [
    diagnostic("context_switching_density", d1, "Changes between recorded software contexts are evaluated alongside other findings."),
    diagnostic("task_execution_fragmentation", d2, "More earlier comparable work and baseline history are needed for this comparison."),
    diagnostic(
      "schedule_variance",
      d4,
      "Schedule variance is not available yet because plan/schedule snapshots are not currently available to Pattern Analytics.",
      "NOT_AVAILABLE",
    ),
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
    reason: d3Diagnostics.length ? [...new Set(d3Diagnostics.map((item) => item.reason))].join(" ") : "No closed task-linked sessions are available for comparison. D3 only evaluates closed sessions explicitly linked to the same task; unlinked continuous work is not eligible evidence.",
    eligibleOccasions: d3Eligible.length, eligibleDays: countDistinctCalendarDays(d3Eligible.map((item) => item.session.startedAt), data.timezone),
    meanCoverageRatio: d3Eligible.length ? d3Eligible.reduce((sum, item) => sum + item.d3.coverageRatio, 0) / d3Eligible.length : null,
    availability: "AVAILABLE" });
  const hasObservations = data.timeline.blocks.some((block) => block.observation !== null);
  const state: PatternsState = patterns.length ? "ok" : !hasObservations ? data.connected ? "no-observations" : "not-connected"
    : qualifiedEvaluation ? "no-findings" : "insufficient-evidence";
  return { state, window: data.window, patterns: patterns.sort((a, b) => compare(a.metadata.patternId, b.metadata.patternId)),
    diagnostics: { perDetector: diagnostics.sort((a, b) => compare(a.identity, b.identity)), recordingHistory: data.recordingHistory } };
}

