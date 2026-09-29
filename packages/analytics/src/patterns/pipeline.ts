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
  evaluateEscapeHatchEpisode,
  evaluateEscapeHatchPattern,
  evaluatePlannedActualEpisode,
  evaluatePlannedActualPattern,
  evaluateStartFrictionPattern,
  calculateStartLatency,
  resolveFirstWorkStart,
  evaluateTaskFragmentationEpisode,
  evaluateTaskFragmentationPattern,
  initializeProvisionalReliability,
  median,
  promotePattern,
  ScheduleVarianceDetector,
  segmentTaskExecutionEpisodes,
  subtractCalendarDays,
  configureDetectorCatalogEntry,
  getDetectorCatalogEntry,
  type ContextSwitchingMetrics,
  type ContextSwitchingPatternMetrics,
  type ContinuousActivityMetrics,
  type DetectorIdentity,
  type EscapeHatchConfig,
  type EscapeHatchEpisodeInput,
  type EscapeHatchEpisodeMetrics,
  type EscapeHatchPatternMetrics,
  type PatternPromotionInput,
  type PlannedActualConfig,
  type PlannedActualEpisodeInput,
  type PlannedActualEpisodeMetrics,
  type PlannedActualPatternMetrics,
  type StartFrictionConfig,
  type StartFrictionPatternMetrics,
  type TaskExecutionFragmentationMetrics,
  type OutcomeInput,
} from "../index";
import { PatternExecutionContext, type PatternLevelExecutionContext, type EpisodeExecutionContext } from "./base/context";
import type { ContextSwitchingConfig } from "./detectors/context-switching/types";
import type { TaskFragmentationConfig } from "./detectors/task-fragmentation/types";
import type { TaskScheduleInstance } from "./detectors/schedule-variance/types";
import {
  GOLDEN_HOURS_AM_END_MINUTES,
  GOLDEN_HOURS_AM_START_MINUTES,
  GOLDEN_HOURS_CONTEXT_KEY,
  GOLDEN_HOURS_PM_END_MINUTES,
  GOLDEN_HOURS_PM_START_MINUTES,
  type GoldenHoursConfig,
  type GoldenHoursDayEpisode,
  type GoldenHoursPatternMetrics,
} from "./detectors/golden-hours/types";
import { collectGoldenHoursDayEpisodes } from "./detectors/golden-hours/episode";
import { evaluateGoldenHoursPattern } from "./detectors/golden-hours/pattern";
import { collectScheduleInstances } from "./detectors/schedule-variance/provider";
import { stableId, compare, overlaps, timelineFromBlocks } from "./evidence-assembler";

export const PATTERN_ENGINE_VERSION = "1.0.0";
export const PATTERN_CONFIG_VERSION = "api-prototype-1";

export type PatternsState =
  | "not-connected"
  | "no-observations"
  | "insufficient-evidence"
  | "no-findings"
  | "ok"
  | "NO_RUN"
  | "RUNNING"
  | "FAILED";

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
  tasks: Array<{
    id: string;
    completedAt: string | null;
    /**
     * Authoritative planned start from the stored task record (never inferred
     * from session times). Absent/null means the episode contract reports
     * NO_PLANNED_START downstream.
     */
    plannedStart?: string | null;
    /** As-of marker of the plan value used, when the source exposes it. */
    plannedCapturedAt?: string | null;
    plannedDurationMinutes?: number | null;
  }>;
  /**
   * Pre-built schedule instances for D4. When omitted, the pipeline derives
   * them via collectScheduleInstances() from tasks + sessions (additive
   * extension point: later detectors reuse this input without renames).
   */
  scheduleInstances?: TaskScheduleInstance[];
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
/**
 * Primary-eligibility thresholds for D1 (product policy, mirrors the detector
 * gates: 5 sessions / 3 days minima, |contrast| >= 0.5, recurrence >= 0.6).
 * Below-gate D1 output stays contributor-only (internal); only a DETECTED D1
 * with an evaluated personal baseline is routed through promotePattern.
 */
export const contextSwitchingThresholds = {
  minimumComparableOccasions: 5, minimumDistinctDays: 3, minimumCoverageRatio: 0.85, maximumUnknownFraction: 0.2,
  minimumBaselineOccasions: 5, minimumBaselineDays: 3, minimumAbsoluteContrast: 0.5,
};

/**
 * Golden-hours configuration (D5 product policy, mirrors the D1 minima:
 * 5 occasions / 3 days, |contrast| >= 0.5, directional share >= 2/3).
 * Windows are fixed at 09:30-11:30 vs 15:00-18:00 in the detector timezone.
 * Each window must contribute at least 30 minutes of observed activity for a
 * day to qualify; days below the floor report INSUFFICIENT_EVIDENCE.
 */
export const goldenHoursConfig: GoldenHoursConfig = {
  amStartMinutes: GOLDEN_HOURS_AM_START_MINUTES, amEndMinutes: GOLDEN_HOURS_AM_END_MINUTES,
  pmStartMinutes: GOLDEN_HOURS_PM_START_MINUTES, pmEndMinutes: GOLDEN_HOURS_PM_END_MINUTES,
  minimumWindowObservedSeconds: 1800,
  minimumQualifyingDayEpisodes: 5, minimumQualifyingCalendarDays: 3,
  minimumBaselineDayEpisodes: 5, minimumBaselineDays: 3,
  contrastThreshold: 0.5, directionalShareThreshold: 2 / 3,
  minimumPatternCoverageRatio: 0.85, maximumUnknownFraction: 0.2,
};

/**
 * Primary-eligibility thresholds for D5 (mirrors the detector gates so
 * promotion never admits a below-gate finding).
 */
export const goldenHoursThresholds = {
  minimumComparableOccasions: 5, minimumDistinctDays: 3, minimumCoverageRatio: 0.85, maximumUnknownFraction: 0.2,
  minimumBaselineOccasions: 5, minimumBaselineDays: 3, minimumAbsoluteContrast: 0.5,
};

/**
 * Start-friction configuration (D6 product policy, mirrors the D1 minima:
 * 5 occasions / 3 days, directional share >= 2/3). An onset counts as friction
 * only beyond a 5-minute on-time tolerance, so trivial seconds-late starts
 * never qualify.
 */
export const startFrictionConfig: StartFrictionConfig = {
  onTimeToleranceSeconds: 300, minimumQualifyingTaskInstances: 5, minimumDistinctCalendarDays: 3,
  minimumPatternCoverageRatio: 0.8, frictionShareThreshold: 2 / 3,
  detectorVersion: "1.0.0", configurationVersion: PATTERN_CONFIG_VERSION,
};

/**
 * Primary-eligibility thresholds for D6 (mirrors the detector gates; the
 * contrast floor equals the on-time tolerance so promotion never admits a
 * within-tolerance median).
 */
export const startFrictionThresholds = {
  minimumComparableOccasions: 5, minimumDistinctDays: 3, minimumCoverageRatio: 0.8, maximumUnknownFraction: 0.2,
  minimumBaselineOccasions: 1, minimumBaselineDays: 1, minimumAbsoluteContrast: 300,
};

/**
 * Escape-hatch configuration (D7 product policy, mirrors the D1 minima:
 * 5 occasions / 3 days, escape share >= 2/3). Friction is a stall shortly
 * after recorded work begins (gap > 10m within 30m of the task start, or an
 * INDETERMINATE block); escape is listed escape-context activity within 5m
 * after. Co-occurrence only — never causal.
 */
export const escapeHatchConfig: EscapeHatchConfig = {
  frictionGapThresholdSeconds: 600, frictionLookbackSeconds: 1800, escapeAfterSeconds: 300,
  minimumQualifyingTaskStarts: 5, minimumDistinctCalendarDays: 3, escapeShareThreshold: 2 / 3,
  minimumPatternCoverageRatio: 0.5, maximumUnknownFraction: 0.2,
  detectorVersion: "1.0.0", configurationVersion: PATTERN_CONFIG_VERSION,
};

/**
 * Primary-eligibility thresholds for D7 (mirrors the detector gates; the
 * contrast floor sits below the escape-share gate so promotion never admits
 * a below-gate share).
 */
export const escapeHatchThresholds = {
  minimumComparableOccasions: 5, minimumDistinctDays: 3, minimumCoverageRatio: 0.5, maximumUnknownFraction: 0.2,
  minimumBaselineOccasions: 1, minimumBaselineDays: 1, minimumAbsoluteContrast: 0.5,
};

/**
 * Planned-vs-actual configuration (D8 product policy: >= 5 completions /
 * >= 3 days, overrun share >= 2/3). Overrun means a bias ratio at or above
 * 1.2x; only completed tasks with a positive plan and recorded session time
 * qualify.
 */
export const plannedActualConfig: PlannedActualConfig = {
  minimumQualifyingCompletedTasks: 5, minimumDistinctCalendarDays: 3,
  overrunRatioThreshold: 1.2, overrunShareThreshold: 2 / 3,
  minimumPatternCoverageRatio: 0.8, maximumUnknownFraction: 0.2,
  detectorVersion: "1.0.0", configurationVersion: PATTERN_CONFIG_VERSION,
};

/**
 * Primary-eligibility thresholds for D8 (mirrors the detector gates; the
 * contrast floor equals the overrun excess so promotion never admits a
 * within-plan median).
 */
export const plannedActualThresholds = {
  minimumComparableOccasions: 5, minimumDistinctDays: 3, minimumCoverageRatio: 0.8, maximumUnknownFraction: 0.2,
  minimumBaselineOccasions: 1, minimumBaselineDays: 1, minimumAbsoluteContrast: 0.2,
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

/**
 * Builds a primary promotion candidate from a DETECTED D1 output.
 *
 * Purpose: route primary-eligible context-switching through promotePattern
 * with the catalog entry. Below-gate output returns null, leaving the
 * existing contributor-only (internal) behavior unchanged.
 *
 * Contrast units: signed relative change of median switches/hour versus the
 * personal baseline (same units as switchContrastThreshold). Assumes episode
 * windows are clipped to session spans and AFK/break/unknown intervals are
 * excluded from the switching sequence (see parseContextSequence).
 *
 * Edge cases: returns null for non-DETECTED output, unevaluated baselines,
 * and non-finite contrast. The zero-baseline absolute path stays
 * contributor-only because promotion requires an evaluated own-history
 * comparison.
 */
function contextSwitchingCandidate(
  data: PatternPipelineInput,
  current: SessionEpisode[],
  historical: SessionEpisode[],
  d1: BehavioralPatternOutput<ContextSwitchingPatternMetrics>,
): PatternPromotionInput | null {
  if (d1.executionStatus !== "DETECTED" || d1.baseline.comparisonStatus !== "EVALUATED") return null;
  const contrast = d1.baseline.deltaRatio;
  if (contrast === null || !Number.isFinite(contrast)) return null;
  const entry = getDetectorCatalogEntry("context_switching_density");
  const qualified = current.filter((item) => item.d1.executionStatus === "QUALIFIED");
  const historyQualified = historical.filter((item) => item.d1.executionStatus === "QUALIFIED");
  const days = (items: SessionEpisode[]) => countDistinctCalendarDays(items.map((item) => item.session.startedAt), data.timezone);
  const taskIds = [...new Set(qualified.flatMap((item) => item.session.taskId ? [item.session.taskId] : []))].sort();
  const evidenceRefs: PatternEvidenceRef[] = qualified.map((item) => ({
    occasionId: item.session.id, date: resolveProductiveDay(item.session.startedAt, { timezone: data.timezone }),
    window: { start: item.session.startedAt, end: item.session.endedAt! },
    blockIds: item.bounded.blocks.map((block) => block.id).sort(), sessionIds: [item.session.id],
    taskIds: item.session.taskId ? [item.session.taskId] : [],
    reportIds: data.reports.filter((report) => report.windowStart && report.windowEnd && overlaps(report.windowStart, report.windowEnd,
      { start: item.session.startedAt, end: item.session.endedAt! })).map((report) => report.id).sort(),
  }));
  const boundedBlocks = qualified.flatMap((item) => item.bounded.blocks);
  const boundedSeconds = boundedBlocks.reduce((sum, block) => sum + block.durationSeconds, 0);
  const unknownSeconds = boundedBlocks.filter((block) => block.coverage !== "OBSERVED" && block.coverage !== "OBSERVED_REPORTED")
    .reduce((sum, block) => sum + block.durationSeconds, 0);
  const unknownFraction = boundedSeconds > 0 ? unknownSeconds / boundedSeconds : 1;
  const direction = contrast > 0 ? "increased" : contrast < 0 ? "decreased" : "unchanged";
  const resultId = stableId(data.userId, "D1-primary", data.window);
  const caveats = [
    "Prototype thresholds are configurable product policy, not calibrated confidence.",
    "Switching counts describe recorded software contexts, not attention or the value of the work.",
    "Comparison is limited to closed manual sessions with qualified switching telemetry; identical measurement and coverage rules apply in both windows.",
    "AFK, break, and unobserved intervals end a context run instead of contributing switches.",
  ];
  return {
    metadata: { evaluationId: resultId, patternId: resultId, detectorVersion: PATTERN_ENGINE_VERSION, configurationVersion: PATTERN_CONFIG_VERSION, generatedAt: data.window.end },
    userId: data.userId, detectorIdentity: "context_switching_density", patternType: "context_switching_density", role: "primary", resultId,
    taxonomy: "context_dynamics", level: "PATTERN", attributionMode: "TASK_LINKED",
    executionStatus: "DETECTED",
    temporalWindow: { ...data.window, scale: "14_DAY" }, sample: { ...d1.sample },
    baseline: { ...d1.baseline },
    metrics: { ...d1.metrics },
    reliability: d1.reliability,
    evidenceReferences: { contributingSessionIds: qualified.map((item) => item.session.id).sort(), contributingTaskIds: taskIds, sampleBoundingWindows: evidenceRefs.map((ref) => ref.window) },
    epistemicCaveats: caveats, caveats,
    claim: direction === "increased"
      ? "Recorded changes between software contexts were more frequent than in earlier comparable records; elevated switching often co-occurs with denser recorded activity, which these records do not explain."
      : "Recorded changes between software contexts were less frequent than in earlier comparable records; calmer switching often co-occurs with steadier recorded activity, which these records do not explain.",
    claimLevel: "co-occurrence", repertoireCategory: "changed",
    comparison: { referenceKind: "own-history", window: data.baselineWindow, comparabilityNote: "Closed manual sessions with qualified switching telemetry; identical measurement and coverage rules in both windows." },
    eligibility: { required: { ...contextSwitchingThresholds }, observed: {},
      excluded: current.filter((item) => item.d1.executionStatus !== "QUALIFIED").map((item) => ({ occasionId: item.session.id, reason: item.d1.executionStatus })) },
    contributingResults: [{ detectorIdentity: "context_switching_density", resultId, metricsUsed: ["switchesPerHour"], role: "primary" }],
    evidenceRefs,
    qualification: {
      validity: { afkExcluded: true, unknownExcluded: true, windowsClipped: true, taskLinkagePreserved: true, metricQualifiedBaseline: true },
      context: { kind: "task", key: taskIds.length ? taskIds.map((id) => `task:${id}`).join(" ") : "task:unlinked", description: "Closed manual sessions with qualified context-switching telemetry." },
      contrast: { size: contrast, direction },
      unknownFraction, baselineSample: { comparableOccasions: historyQualified.length, distinctDays: days(historyQualified) }, userQuestion: entry.userQuestions[0]!,
    },
  };
}

/**
 * Collects golden-hours day-episodes for one timeline. Days are kept only
 * when fully inside the analytical window so evidence references stay bounded
 * (promotion requires every ref window within the temporal window).
 */
function goldenHoursDayEpisodes(data: PatternPipelineInput, timeline: EvidenceTimeline): GoldenHoursDayEpisode[] {
  const window = { start: timeline.windowStart, end: timeline.windowEnd };
  return collectGoldenHoursDayEpisodes({
    blocks: timeline.blocks,
    sessions: data.sessions.map((session) => ({
      id: session.id, taskId: session.taskId ?? null, startedAt: session.startedAt, endedAt: session.endedAt ?? null,
    })),
    reports: data.reports,
    window,
    timezone: data.timezone,
  }, goldenHoursConfig).filter((episode) => episode.amWindow.start >= window.start && episode.pmWindow.end <= window.end);
}

/**
 * Builds a primary promotion candidate from a DETECTED D5 output.
 *
 * Purpose: route primary-eligible golden-hours findings through
 * promotePattern with the catalog entry. Below-gate output returns null and
 * promotes nothing.
 *
 * Contrast units: signed relative change of the median AM switches/hour
 * against the median PM switches/hour (negative when recorded mornings are
 * calmer). The own-history reference is afternoon switching from the baseline
 * window, measured with identical windows. Focus means use the explicit 1-3
 * ordinal scale (scattered/mixed/focused); days without ratings compare
 * switching alone and never invent focus values.
 *
 * Edge cases: returns null for non-DETECTED output, unevaluated baselines,
 * non-finite contrast, and empty evidence (a day whose span was clipped out
 * of the analytical window contributes no bounded ref).
 */
function goldenHoursCandidate(
  data: PatternPipelineInput,
  current: GoldenHoursDayEpisode[],
  baseline: GoldenHoursDayEpisode[],
  d5: BehavioralPatternOutput<GoldenHoursPatternMetrics>,
): PatternPromotionInput | null {
  if (d5.executionStatus !== "DETECTED" || d5.baseline.comparisonStatus !== "EVALUATED") return null;
  const contrast = d5.metrics.contrast;
  if (contrast === null || !Number.isFinite(contrast)) return null;
  const entry = getDetectorCatalogEntry("golden_hours_focus");
  const qualified = current.filter((item) => item.executionStatus === "QUALIFIED");
  const days = (items: GoldenHoursDayEpisode[]) => new Set(items.map((item) => item.date)).size;
  const evidenceRefs: PatternEvidenceRef[] = [];
  for (const item of qualified) {
    const dayStart = item.amWindow.start < item.pmWindow.start ? item.amWindow.start : item.pmWindow.start;
    const dayEnd = item.amWindow.end > item.pmWindow.end ? item.amWindow.end : item.pmWindow.end;
    const clipped = {
      start: dayStart > data.window.start ? dayStart : data.window.start,
      end: dayEnd < data.window.end ? dayEnd : data.window.end,
    };
    if (!(clipped.start < clipped.end)) continue;
    evidenceRefs.push({
      occasionId: `golden-hours-${item.date}`, date: item.date, window: clipped,
      blockIds: [...new Set([...item.am.blockIds, ...item.pm.blockIds])].sort(),
      sessionIds: [...item.sessionIds].sort(),
      taskIds: [...new Set(data.sessions.filter((session) => item.sessionIds.includes(session.id))
        .flatMap((session) => session.taskId ? [session.taskId] : []))].sort(),
      reportIds: [...item.reportIds].sort(),
    });
  }
  if (!evidenceRefs.length) return null;
  const totalSpan = qualified.reduce((sum, item) => sum + item.windowSpanSeconds, 0);
  const totalUnknown = qualified.reduce((sum, item) => sum + item.unknownFraction * item.windowSpanSeconds, 0);
  const unknownFraction = totalSpan > 0 ? totalUnknown / totalSpan : 1;
  const baselineQualified = baseline.filter((item) => item.executionStatus === "QUALIFIED");
  const resultId = stableId(data.userId, "D5", data.window);
  const focusCorroborated = d5.metrics.focusDays > 0;
  const caveats = [
    "Prototype thresholds are configurable product policy, not calibrated confidence.",
    "Switching counts describe recorded software contexts, not attention or the value of the work.",
    "Self-reported focus uses an explicit 1-3 ordinal scale (scattered/mixed/focused); days without ratings compare switching alone and no focus values are invented.",
    "Comparison is limited to days with both the morning and afternoon windows observed; identical measurement and coverage rules apply in both windows.",
  ];
  return {
    metadata: { evaluationId: resultId, patternId: resultId, detectorVersion: PATTERN_ENGINE_VERSION, configurationVersion: PATTERN_CONFIG_VERSION, generatedAt: data.window.end },
    userId: data.userId, detectorIdentity: "golden_hours_focus", patternType: "golden_hours_focus", role: "primary", resultId,
    taxonomy: "temporal_distribution", level: "PATTERN", attributionMode: "GENERAL",
    executionStatus: "DETECTED",
    temporalWindow: { ...data.window, scale: "14_DAY" }, sample: { ...d5.sample },
    baseline: { ...d5.baseline },
    metrics: { ...d5.metrics },
    reliability: initializeProvisionalReliability({ qualifyingDayCount: days(qualified), qualifyingEpisodeCount: qualified.length,
      meanTelemetryCoverageRatio: d5.sample.meanCoverageRatio, baselineMaturityDays: days(baselineQualified),
      hasCorroboratingSelfReport: focusCorroborated }),
    evidenceReferences: { contributingSessionIds: [...new Set(qualified.flatMap((item) => item.sessionIds))].sort(),
      contributingTaskIds: [...new Set(data.sessions.flatMap((session) => session.taskId ? [session.taskId] : []))].sort(),
      sampleBoundingWindows: evidenceRefs.map((ref) => ref.window) },
    epistemicCaveats: caveats, caveats,
    claim: focusCorroborated
      ? "Recorded mornings showed calmer switching between software contexts than afternoons on the same days; calmer recorded mornings often co-occur with steadier reported focus, which these records do not explain."
      : "Recorded mornings showed calmer switching between software contexts than afternoons on the same days; these records do not describe why mornings differ from afternoons.",
    claimLevel: "co-occurrence", repertoireCategory: "mismatch",
    comparison: { referenceKind: "own-history", window: data.baselineWindow, comparabilityNote: "Identical morning-vs-afternoon window measurement in the current and baseline windows; the reference is afternoon switching from the user's own history." },
    eligibility: { required: { ...goldenHoursThresholds }, observed: {},
      excluded: current.filter((item) => item.executionStatus !== "QUALIFIED").map((item) => ({ occasionId: `golden-hours-${item.date}`, reason: item.executionStatus })) },
    contributingResults: [{ detectorIdentity: "golden_hours_focus", resultId,
      metricsUsed: focusCorroborated ? ["switchesPerHour", "meanFocusScore"] : ["switchesPerHour"], role: "primary" }],
    evidenceRefs,
    qualification: {
      validity: { windowsClipped: true, afkExcluded: true, unknownExcluded: true, metricQualifiedBaseline: true },
      context: { kind: "time-window", key: GOLDEN_HOURS_CONTEXT_KEY, description: "Same-day morning vs afternoon windows in the detector timezone." },
      contrast: { size: contrast, direction: "decreased" },
      unknownFraction, baselineSample: { comparableOccasions: baselineQualified.length, distinctDays: days(baselineQualified) }, userQuestion: entry.userQuestions[0]!,
    },
  };
}

/**
 * Builds a primary promotion candidate from a DETECTED D6 output.
 *
 * Purpose: route primary-eligible start-friction findings through
 * promotePattern with the catalog entry. Below-gate output returns null and
 * promotes nothing.
 *
 * Contrast units: median first-work latency in seconds (positive when
 * recorded work begins later than planned); direction is always "increased"
 * because DETECTED requires a beyond-tolerance late median. The reference is
 * the declared intention (authoritative plannedStart), so no own-history
 * baseline applies. Evidence refs are bounded to the analytical window:
 * tasks whose [plannedStart, actualStart] span escapes the window are
 * excluded rather than clipped into misleading bounds.
 *
 * Edge cases: returns null for non-DETECTED output, non-positive medians,
 * and empty in-window evidence. Session onsets stay uncorroborated
 * declarations; the claim never assigns a reason for the delay.
 */
function startFrictionCandidate(
  data: PatternPipelineInput,
  instances: TaskScheduleInstance[],
  d6: BehavioralPatternOutput<StartFrictionPatternMetrics>,
): PatternPromotionInput | null {
  if (d6.executionStatus !== "DETECTED") return null;
  const medianLatency = d6.metrics.medianLatencySeconds;
  if (medianLatency === null || !Number.isFinite(medianLatency) || medianLatency <= 0) return null;
  const entry = getDetectorCatalogEntry("start_friction");
  const windowStartMs = Date.parse(data.window.start);
  const windowEndMs = Date.parse(data.window.end);
  const observed = instances.flatMap((instance) => {
    const actualStart = resolveFirstWorkStart(instance);
    const latency = calculateStartLatency(
      instance.taskId, instance.plannedStart, actualStart,
      startFrictionConfig.onTimeToleranceSeconds, instance.plannedCapturedAt ?? null,
    );
    if (latency.status !== "OBSERVED" || latency.actualStart === null || latency.plannedStart === null) {
      return [];
    }
    const plannedMs = Date.parse(latency.plannedStart);
    const actualMs = Date.parse(latency.actualStart);
    if (!(plannedMs >= windowStartMs && actualMs <= windowEndMs && plannedMs < actualMs)) return [];
    return [{ instance, latency }];
  });
  if (!observed.length) return null;
  const days = (items: typeof observed) => countDistinctCalendarDays(
    items.map((item) => item.latency.plannedStart!),
    data.timezone,
  );
  const evidenceRefs: PatternEvidenceRef[] = observed.map(({ instance, latency }) => ({
    occasionId: instance.taskId,
    date: resolveProductiveDay(latency.plannedStart!, { timezone: data.timezone }),
    window: { start: latency.plannedStart!, end: latency.actualStart! },
    blockIds: [],
    sessionIds: instance.sessions
      .filter((session) => session.startedAt === latency.actualStart)
      .map((session) => session.id)
      .sort(),
    taskIds: [instance.taskId],
    reportIds: data.reports.filter((report) => report.windowStart && report.windowEnd && overlaps(
      report.windowStart, report.windowEnd,
      { start: latency.plannedStart!, end: latency.actualStart! },
    )).map((report) => report.id).sort(),
  })).filter((ref) => ref.sessionIds.length > 0);
  if (!evidenceRefs.length) return null;
  const totalObservedHours = observed.reduce((sum, { instance }) => sum + instance.sessions.reduce((inner, session) => {
    if (typeof session.durationSeconds === "number" && session.durationSeconds > 0) return inner + session.durationSeconds;
    if (session.startedAt && session.endedAt) {
      const dur = (Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000;
      return inner + (dur > 0 ? dur : 0);
    }
    return inner;
  }, 0), 0) / 3600;
  const resultId = stableId(data.userId, "D6", data.window);
  const medianMinutes = Math.round(medianLatency / 60);
  const caveats = [
    "Prototype thresholds are configurable product policy, not calibrated confidence.",
    "Session onsets are uncorroborated declarations; a recorded start does not prove work began at that moment.",
    "Comparison is limited to planned tasks with an authoritative planned start and a recorded onset; identical measurement rules apply to every occasion.",
  ];
  return {
    metadata: { evaluationId: resultId, patternId: resultId, detectorVersion: PATTERN_ENGINE_VERSION, configurationVersion: PATTERN_CONFIG_VERSION, generatedAt: data.window.end },
    userId: data.userId, detectorIdentity: "start_friction", patternType: "start_friction", role: "primary", resultId,
    taxonomy: "execution_friction", level: "PATTERN", attributionMode: "TASK_LINKED",
    executionStatus: "DETECTED",
    temporalWindow: { ...data.window, scale: "14_DAY" },
    sample: { qualifyingEpisodes: evidenceRefs.length, qualifyingDays: days(observed), totalObservedHours, meanCoverageRatio: 1.0 },
    baseline: { strategy: "NONE", comparedMetric: "latencySeconds", baselineValue: null, currentValue: medianLatency, deltaRatio: null, comparisonStatus: "NOT_APPLICABLE" },
    metrics: { ...d6.metrics },
    reliability: initializeProvisionalReliability({ qualifyingDayCount: days(observed), qualifyingEpisodeCount: evidenceRefs.length,
      meanTelemetryCoverageRatio: 1.0, baselineMaturityDays: 0, hasCorroboratingSelfReport: false }),
    evidenceReferences: { contributingSessionIds: [...new Set(evidenceRefs.flatMap((ref) => ref.sessionIds))].sort(),
      contributingTaskIds: [...new Set(evidenceRefs.flatMap((ref) => ref.taskIds))].sort(),
      sampleBoundingWindows: evidenceRefs.map((ref) => ref.window) },
    epistemicCaveats: caveats, caveats,
    claim: `Recorded work began later than planned on ${d6.metrics.frictionTaskCount} of ${d6.metrics.observedTaskCount} comparable planned tasks; the median delay was ${medianMinutes} minutes.`,
    claimLevel: "recurrence", repertoireCategory: "friction",
    comparison: { referenceKind: "declared-intention", window: data.baselineWindow, comparabilityNote: "Planned tasks with an authoritative planned start and a recorded onset; identical onset measurement in every occasion." },
    eligibility: { required: { ...startFrictionThresholds }, observed: {},
      excluded: instances.filter((instance) => !evidenceRefs.some((ref) => ref.occasionId === instance.taskId))
        .map((instance) => ({ occasionId: instance.taskId, reason: !instance.plannedStart ? "NO_PLANNED_START" : "NOT_OBSERVED_OR_OUT_OF_WINDOW" })) },
    contributingResults: [{ detectorIdentity: "start_friction", resultId, metricsUsed: ["latencySeconds"], role: "primary" }],
    evidenceRefs,
    qualification: {
      validity: { windowsClipped: true, planSnapshots: true },
      context: { kind: "commitment", key: "planned-start", description: "Authoritative planned starts compared with first recorded work per task." },
      contrast: { size: medianLatency, direction: "increased" },
      unknownFraction: 0, baselineSample: { comparableOccasions: 0, distinctDays: 0 }, userQuestion: entry.userQuestions[0]!,
    },
  };
}

/**
 * Builds a primary promotion candidate from a DETECTED D7 output.
 *
 * Purpose: route primary-eligible escape-hatch findings through
 * promotePattern with the catalog entry. Below-gate output returns null and
 * promotes nothing.
 *
 * Contrast units: escape share (escaped friction occasions / friction
 * occasions), a fraction in (0, 1]; direction is always "increased" because
 * DETECTED requires a share above the gate. The reference is the declared
 * task onset itself. Copy stays co-occurrence-only: the claim uses "often
 * co-occurs" phrasing and must pass isNonCausalClaim.
 *
 * Edge cases: returns null for non-DETECTED output, non-finite shares, and
 * empty evidence. Only friction-observed onsets divide the share;
 * starts without observed friction are excluded, never counted as negatives.
 */
function escapeHatchCandidate(
  data: PatternPipelineInput,
  episodes: import("@repo/types").EpisodeMeasurementOutput<EscapeHatchEpisodeMetrics>[],
  d7: BehavioralPatternOutput<EscapeHatchPatternMetrics>,
): PatternPromotionInput | null {
  if (d7.executionStatus !== "DETECTED") return null;
  const share = d7.metrics.escapeShare;
  if (share === null || !Number.isFinite(share) || share <= 0) return null;
  const entry = getDetectorCatalogEntry("escape_hatch");
  const qualified = episodes.filter((episode) => episode.executionStatus === "QUALIFIED");
  const windowStartMs = Date.parse(data.window.start);
  const windowEndMs = Date.parse(data.window.end);
  const evidenceRefs: PatternEvidenceRef[] = [];
  for (const episode of qualified) {
    const taskStartMs = Date.parse(episode.metrics.taskStart);
    if (!(taskStartMs >= windowStartMs && taskStartMs < windowEndMs)) continue;
    const endMs = Math.min(
      Date.parse(episode.metrics.escapeAt ?? episode.metrics.frictionEnd ?? episode.metrics.taskStart),
      windowEndMs,
    );
    if (!(endMs > taskStartMs)) continue;
    evidenceRefs.push({
      occasionId: episode.metrics.sessionId,
      date: resolveProductiveDay(episode.metrics.taskStart, { timezone: data.timezone }),
      window: { start: episode.metrics.taskStart, end: new Date(endMs).toISOString() },
      blockIds: [],
      sessionIds: [episode.metrics.sessionId],
      taskIds: [episode.metrics.taskId],
      reportIds: [],
    });
  }
  if (!evidenceRefs.length) return null;
  const days = new Set(evidenceRefs.map((ref) => ref.date)).size;
  const taskIds = [...new Set(evidenceRefs.flatMap((ref) => ref.taskIds))].sort();
  const totalObservedHours = qualified.reduce((sum, episode) => sum + episode.activeDurationSeconds, 0) / 3600;
  const totalSpan = qualified.reduce((sum, episode) => sum + episode.metrics.assessmentSpanSeconds, 0);
  const totalUnknown = qualified.reduce((sum, episode) => sum + episode.metrics.assessmentUnknownSeconds, 0);
  const unknownFraction = totalSpan > 0 ? totalUnknown / totalSpan : 1;
  const resultId = stableId(data.userId, "D7", data.window);
  const caveats = [
    "Prototype thresholds are configurable product policy, not calibrated confidence.",
    "Friction describes recorded gaps near task starts, not the reason work stalled.",
    "Escape-context activity is identified from an explicit domain list; unknown or missing domains are excluded, never guessed.",
  ];
  return {
    metadata: { evaluationId: resultId, patternId: resultId, detectorVersion: PATTERN_ENGINE_VERSION, configurationVersion: PATTERN_CONFIG_VERSION, generatedAt: data.window.end },
    userId: data.userId, detectorIdentity: "escape_hatch", patternType: "escape_hatch", role: "primary", resultId,
    taxonomy: "execution_friction", level: "PATTERN", attributionMode: "TASK_LINKED",
    executionStatus: "DETECTED",
    temporalWindow: { ...data.window, scale: "14_DAY" },
    sample: { qualifyingEpisodes: evidenceRefs.length, qualifyingDays: days, totalObservedHours, meanCoverageRatio: d7.sample.meanCoverageRatio },
    baseline: { strategy: "NONE", comparedMetric: "escapeShare", baselineValue: null, currentValue: share, deltaRatio: null, comparisonStatus: "NOT_APPLICABLE" },
    metrics: { ...d7.metrics },
    reliability: initializeProvisionalReliability({ qualifyingDayCount: days, qualifyingEpisodeCount: evidenceRefs.length,
      meanTelemetryCoverageRatio: d7.sample.meanCoverageRatio, baselineMaturityDays: 0, hasCorroboratingSelfReport: false }),
    evidenceReferences: { contributingSessionIds: [...new Set(evidenceRefs.flatMap((ref) => ref.sessionIds))].sort(),
      contributingTaskIds: taskIds, sampleBoundingWindows: evidenceRefs.map((ref) => ref.window) },
    epistemicCaveats: caveats, caveats,
    claim: `Friction near recorded task starts often co-occurs with escape-context activity within minutes (${d7.metrics.escapedStarts} of ${d7.metrics.qualifyingStarts} friction occasions); these records do not describe why either occurs.`,
    claimLevel: "co-occurrence", repertoireCategory: "mismatch",
    comparison: { referenceKind: "declared-intention", window: data.baselineWindow, comparabilityNote: "Recorded task onsets with observed friction near the start; identical friction and escape measurement in every occasion." },
    eligibility: { required: { ...escapeHatchThresholds }, observed: {},
      excluded: episodes.filter((episode) => !evidenceRefs.some((ref) => ref.occasionId === episode.metrics.sessionId))
        .map((episode) => ({ occasionId: episode.metrics.sessionId, reason: episode.executionStatus })) },
    contributingResults: [{ detectorIdentity: "escape_hatch", resultId, metricsUsed: ["escapeShare"], role: "primary" }],
    evidenceRefs,
    qualification: {
      validity: { windowsClipped: true, taskLinkagePreserved: true },
      context: { kind: "task", key: taskIds.length ? taskIds.map((id) => `task:${id}`).join(" ") : "task:unlinked", description: "Recorded task onsets with observed friction near the start." },
      contrast: { size: share, direction: "increased" },
      unknownFraction, baselineSample: { comparableOccasions: 0, distinctDays: 0 }, userQuestion: entry.userQuestions[0]!,
    },
  };
}

/**
 * Builds a primary promotion candidate from a DETECTED D8 output.
 *
 * Purpose: route primary-eligible planned-vs-actual findings through
 * promotePattern with the catalog entry. Below-gate output returns null and
 * promotes nothing.
 *
 * Contrast units: median bias excess (medianBiasRatio - 1), positive when
 * actuals run longer than planned; direction is always "increased" because
 * DETECTED requires a median at or above the overrun ratio. The reference is
 * the declared plan (plannedDurationMinutes). Only completed tasks with a
 * positive plan and recorded session time divide the bias.
 *
 * Edge cases: returns null for non-DETECTED output, non-finite medians, and
 * empty in-window evidence. Tasks whose [firstSessionStart, completedAt]
 * span escapes the analytical window are excluded rather than clipped.
 */
function plannedActualCandidate(
  data: PatternPipelineInput,
  inputs: PlannedActualEpisodeInput[],
  episodes: import("@repo/types").EpisodeMeasurementOutput<PlannedActualEpisodeMetrics>[],
  d8: BehavioralPatternOutput<PlannedActualPatternMetrics>,
): PatternPromotionInput | null {
  if (d8.executionStatus !== "DETECTED") return null;
  const medianBias = d8.metrics.medianBiasRatio;
  if (medianBias === null || !Number.isFinite(medianBias) || medianBias < 1) return null;
  const entry = getDetectorCatalogEntry("planned_vs_actual");
  const windowStartMs = Date.parse(data.window.start);
  const windowEndMs = Date.parse(data.window.end);
  const byTask = new Map(episodes.map((episode) => [episode.metrics.taskId, episode]));
  const evidenceRefs: PatternEvidenceRef[] = [];
  for (const input of inputs) {
    const episode = byTask.get(input.taskId);
    if (!episode || episode.executionStatus !== "QUALIFIED") continue;
    const starts = input.sessions
      .map((session) => Date.parse(session.startedAt))
      .filter((ms) => Number.isFinite(ms));
    if (!starts.length || !episode.metrics.completedAt) continue;
    const firstStartMs = Math.min(...starts);
    const completedMs = Date.parse(episode.metrics.completedAt);
    if (!(firstStartMs >= windowStartMs && completedMs <= windowEndMs && firstStartMs < completedMs)) continue;
    evidenceRefs.push({
      occasionId: input.taskId,
      date: resolveProductiveDay(episode.metrics.completedAt, { timezone: data.timezone }),
      window: { start: new Date(firstStartMs).toISOString(), end: episode.metrics.completedAt },
      blockIds: [],
      sessionIds: input.sessions.map((session) => session.id).sort(),
      taskIds: [input.taskId],
      reportIds: [],
    });
  }
  if (!evidenceRefs.length) return null;
  const days = new Set(evidenceRefs.map((ref) => ref.date)).size;
  const taskIds = [...new Set(evidenceRefs.flatMap((ref) => ref.taskIds))].sort();
  const resultId = stableId(data.userId, "D8", data.window);
  const caveats = [
    "Prototype thresholds are configurable product policy, not calibrated confidence.",
    "Actuals sum recorded session time only; unrecorded work is not observed work.",
    "Comparison is limited to completed tasks with a positive planned duration and recorded session time.",
  ];
  return {
    metadata: { evaluationId: resultId, patternId: resultId, detectorVersion: PATTERN_ENGINE_VERSION, configurationVersion: PATTERN_CONFIG_VERSION, generatedAt: data.window.end },
    userId: data.userId, detectorIdentity: "planned_vs_actual", patternType: "planned_vs_actual", role: "primary", resultId,
    taxonomy: "schedule_fidelity", level: "PATTERN", attributionMode: "TASK_LINKED",
    executionStatus: "DETECTED",
    temporalWindow: { ...data.window, scale: "14_DAY" },
    sample: { qualifyingEpisodes: evidenceRefs.length, qualifyingDays: days, totalObservedHours: d8.sample.totalObservedHours, meanCoverageRatio: 1.0 },
    baseline: { strategy: "NONE", comparedMetric: "biasRatio", baselineValue: null, currentValue: medianBias, deltaRatio: null, comparisonStatus: "NOT_APPLICABLE" },
    metrics: { ...d8.metrics },
    reliability: initializeProvisionalReliability({ qualifyingDayCount: days, qualifyingEpisodeCount: evidenceRefs.length,
      meanTelemetryCoverageRatio: 1.0, baselineMaturityDays: 0, hasCorroboratingSelfReport: false }),
    evidenceReferences: { contributingSessionIds: [...new Set(evidenceRefs.flatMap((ref) => ref.sessionIds))].sort(),
      contributingTaskIds: taskIds, sampleBoundingWindows: evidenceRefs.map((ref) => ref.window) },
    epistemicCaveats: caveats, caveats,
    claim: `Completed tasks often ran longer than planned (${d8.metrics.overrunTaskCount} of ${d8.metrics.qualifyingTaskCount} comparable completions); the median ratio of actual to planned duration was ${medianBias.toFixed(2)}x.`,
    claimLevel: "recurrence", repertoireCategory: "mismatch",
    comparison: { referenceKind: "declared-intention", window: data.baselineWindow, comparabilityNote: "Completed tasks with a positive planned duration and recorded session time; identical duration measurement in every occasion." },
    eligibility: { required: { ...plannedActualThresholds }, observed: {},
      excluded: inputs.filter((input) => !evidenceRefs.some((ref) => ref.occasionId === input.taskId))
        .map((input) => ({ occasionId: input.taskId, reason: byTask.get(input.taskId)?.executionStatus ?? "NOT_EVALUATED" })) },
    contributingResults: [{ detectorIdentity: "planned_vs_actual", resultId, metricsUsed: ["biasRatio"], role: "primary" }],
    evidenceRefs,
    qualification: {
      validity: { windowsClipped: true, taskLifecycleBounded: true },
      context: { kind: "task", key: taskIds.length ? taskIds.map((id) => `task:${id}`).join(" ") : "task:unlinked", description: "Completed tasks with a planned duration and recorded session time." },
      contrast: { size: medianBias - 1, direction: "increased" },
      unknownFraction: 0, baselineSample: { comparableOccasions: 0, distinctDays: 0 }, userQuestion: entry.userQuestions[0]!,
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
  // D4 input contract: authoritative planned-start snapshots flow in through
  // PatternPipelineInput (tasks.plannedStart, optionally pre-built
  // scheduleInstances). Instances are clipped to the current window by
  // collectScheduleInstances; a null plannedStart stays null so the episode
  // contract reports NO_PLANNED_START instead of inventing a plan.
  // Availability is AVAILABLE when at least one instance carries an
  // authoritative plannedStart, NOT_AVAILABLE when the plan infrastructure
  // contributes nothing (missing input, not a "no finding"). Detector untouched.
  const scheduleInstances = data.scheduleInstances ?? collectScheduleInstances(data.tasks, data.sessions, data.window);
  const scheduleAvailable = scheduleInstances.some((instance) =>
    instance.plannedStart !== null && Number.isFinite(Date.parse(instance.plannedStart)));
  const d4 = new ScheduleVarianceDetector(scheduleConfig).evaluatePatternWithInstances(
    patternContext(data.userId, data.timezone, data.timeline, "schedule_variance", data.window.end),
    stableId("D4", data.window), stableId("D4-pattern", data.window),
    scheduleInstances,
  );
  const diagnostics: DetectorDiagnostics[] = [
    diagnostic("context_switching_density", d1, "Changes between recorded software contexts are evaluated alongside other findings."),
    diagnostic("task_execution_fragmentation", d2, "More earlier comparable work and baseline history are needed for this comparison."),
    diagnostic(
      "schedule_variance",
      d4,
      scheduleAvailable
        ? "Schedule variance evaluated from authoritative planned starts."
        : "Schedule variance is not available yet because plan/schedule snapshots are not currently available to Pattern Analytics.",
      scheduleAvailable ? "AVAILABLE" : "NOT_AVAILABLE",
    ),
  ];
  const taskIds = [...new Set(current.flatMap((item) => item.session.taskId ? [item.session.taskId] : []))].sort();
  const patterns: PatternPromotionInput[] = [];
  // D1 primary path: a DETECTED D1 with an evaluated personal baseline is
  // routed through promotePattern; anything below gate stays internal-only.
  const d1Candidate = contextSwitchingCandidate(data, current, historical, d1);
  if (d1Candidate) {
    const promoted = promotePattern(d1Candidate, configureDetectorCatalogEntry("context_switching_density", contextSwitchingThresholds), data.window);
    if (promoted.promoted) patterns.push(promoted.pattern);
  }
  // D5 primary path: a DETECTED D5 with an evaluated own-history reference is
  // routed through promotePattern; anything below gate promotes nothing.
  // (qualifiedEvaluation is shared with the D3 aggregation below.)
  let qualifiedEvaluation = false;
  const currentGoldenDays = goldenHoursDayEpisodes(data, data.timeline);
  const baselineGoldenDays = collectGoldenHoursDayEpisodes({
    blocks: data.baseline.blocks,
    sessions: data.sessions.map((session) => ({
      id: session.id, taskId: session.taskId ?? null, startedAt: session.startedAt, endedAt: session.endedAt ?? null,
    })),
    reports: data.reports,
    window: { start: data.baseline.windowStart, end: data.baseline.windowEnd },
    timezone: data.timezone,
  }, goldenHoursConfig);
  const d5 = evaluateGoldenHoursPattern(patternContext(data.userId, data.timezone, data.timeline, "golden_hours_focus", data.window.end),
    stableId("D5", data.window), stableId("D5-pattern", data.window), currentGoldenDays, baselineGoldenDays, goldenHoursConfig);
  const d5Candidate = goldenHoursCandidate(data, currentGoldenDays, baselineGoldenDays, d5);
  if (d5Candidate) {
    const promoted = promotePattern(d5Candidate, configureDetectorCatalogEntry("golden_hours_focus", goldenHoursThresholds), data.window);
    if (promoted.promoted) patterns.push(promoted.pattern);
  }
  if (d5.executionStatus === "NO_PATTERN") qualifiedEvaluation = true;
  diagnostics.push(diagnostic("golden_hours_focus", d5,
    d5.executionStatus === "DETECTED"
      ? "Recorded mornings ran calmer than afternoons across comparable days."
      : d5.executionStatus === "NO_PATTERN"
        ? "No consistent morning-vs-afternoon difference was found across comparable days."
        : d5.executionStatus === "INDETERMINATE_COVERAGE"
          ? "Some periods do not have enough recorded activity or telemetry coverage to compare."
          : d5.executionStatus === "INSUFFICIENT_BASELINE_DATA"
            ? "More earlier comparable work is needed for this comparison."
            : "More days with both the morning and afternoon windows observed are needed for this comparison."));
  // D6 input contract: same authoritative schedule instances as D4
  // (plannedStart passed through verbatim, never inferred). The reference is
  // the declared intention itself, so no baseline maturity gate applies.
  const d6 = evaluateStartFrictionPattern(
    patternContext(data.userId, data.timezone, data.timeline, "start_friction", data.window.end),
    stableId("D6", data.window), stableId("D6-pattern", data.window),
    scheduleInstances, startFrictionConfig,
  );
  const d6Candidate = startFrictionCandidate(data, scheduleInstances, d6);
  if (d6Candidate) {
    const promoted = promotePattern(d6Candidate, configureDetectorCatalogEntry("start_friction", startFrictionThresholds), data.window);
    if (promoted.promoted) patterns.push(promoted.pattern);
  }
  if (d6.executionStatus === "NO_PATTERN") qualifiedEvaluation = true;
  diagnostics.push(diagnostic("start_friction", d6,
    d6.executionStatus === "DETECTED"
      ? "Recorded work recurrently began later than planned across comparable planned tasks."
      : d6.executionStatus === "NO_PATTERN"
        ? "No recurrent start delay was found across comparable planned tasks."
        : "More planned tasks with recorded onsets are needed for this comparison."));
  // D7 input contract: closed task-linked sessions as recorded onsets, with
  // the full current-window evidence blocks as the friction/escape surface.
  // Only friction-observed onsets divide the escape share.
  const escapeInputs: EscapeHatchEpisodeInput[] = current
    .filter((item) => item.session.taskId)
    .map((item) => ({
      taskId: item.session.taskId!,
      session: {
        id: item.session.id,
        startedAt: item.session.startedAt,
        endedAt: item.session.endedAt ?? null,
        durationSeconds: item.session.durationSeconds ?? null,
      },
      blocks: data.timeline.blocks,
    }));
  const escapeEpisodes = escapeInputs.map((input, index) => evaluateEscapeHatchEpisode(
    episodeContext(data.userId, data.timezone, data.timeline, "escape_hatch", input.session.id, input.taskId, data.window.end),
    stableId("D7", input.session.id, String(index)), input, escapeHatchConfig,
  ));
  const d7 = evaluateEscapeHatchPattern(
    patternContext(data.userId, data.timezone, data.timeline, "escape_hatch", data.window.end),
    stableId("D7", data.window), stableId("D7-pattern", data.window),
    escapeEpisodes, escapeHatchConfig,
  );
  const d7Candidate = escapeHatchCandidate(data, escapeEpisodes, d7);
  if (d7Candidate) {
    const promoted = promotePattern(d7Candidate, configureDetectorCatalogEntry("escape_hatch", escapeHatchThresholds), data.window);
    if (promoted.promoted) patterns.push(promoted.pattern);
  }
  if (d7.executionStatus === "NO_PATTERN") qualifiedEvaluation = true;
  diagnostics.push(diagnostic("escape_hatch", d7,
    d7.executionStatus === "DETECTED"
      ? "Friction near recorded task starts often co-occurs with escape-context activity within minutes."
      : d7.executionStatus === "NO_PATTERN"
        ? "No recurrent escape-context activity was found after friction near task starts."
        : d7.executionStatus === "INDETERMINATE_COVERAGE"
          ? "Some periods do not have enough recorded activity or telemetry coverage to compare."
          : "More task onsets with observed friction are needed for this comparison."));
  // D8 input contract: completed tasks (completedAt set) with a planned
  // duration; actuals sum in-window recorded session time per task. Only
  // finished work with a positive plan and recorded time qualifies.
  const windowStartMs = Date.parse(data.window.start);
  const windowEndMs = Date.parse(data.window.end);
  const plannedInputs: PlannedActualEpisodeInput[] = data.tasks
    .filter((task) => task.completedAt !== null)
    .map((task) => ({
      taskId: task.id,
      completedAt: task.completedAt,
      plannedDurationMinutes: typeof task.plannedDurationMinutes === "number" ? task.plannedDurationMinutes : null,
      sessions: data.sessions
        .filter((session) => session.taskId === task.id && session.endedAt &&
          Number.isFinite(Date.parse(session.startedAt)) &&
          Date.parse(session.startedAt) >= windowStartMs && Date.parse(session.startedAt) < windowEndMs)
        .map((session) => ({
          id: session.id,
          startedAt: session.startedAt,
          endedAt: session.endedAt ?? null,
          durationSeconds: session.durationSeconds ?? null,
        })),
    }));
  const plannedEpisodes = plannedInputs.map((input, index) => evaluatePlannedActualEpisode(
    episodeContext(data.userId, data.timezone, data.timeline, "planned_vs_actual",
      input.sessions.map((session) => session.id).sort()[0] ?? input.taskId, input.taskId, data.window.end),
    stableId("D8", input.taskId, String(index)), input, plannedActualConfig,
  ));
  const d8 = evaluatePlannedActualPattern(
    patternContext(data.userId, data.timezone, data.timeline, "planned_vs_actual", data.window.end),
    stableId("D8", data.window), stableId("D8-pattern", data.window),
    plannedEpisodes, plannedActualConfig,
  );
  const d8Candidate = plannedActualCandidate(data, plannedInputs, plannedEpisodes, d8);
  if (d8Candidate) {
    const promoted = promotePattern(d8Candidate, configureDetectorCatalogEntry("planned_vs_actual", plannedActualThresholds), data.window);
    if (promoted.promoted) patterns.push(promoted.pattern);
  }
  if (d8.executionStatus === "NO_PATTERN") qualifiedEvaluation = true;
  diagnostics.push(diagnostic("planned_vs_actual", d8,
    d8.executionStatus === "DETECTED"
      ? "Completed tasks recurrently ran longer than planned across comparable completions."
      : d8.executionStatus === "NO_PATTERN"
        ? "No recurrent duration overrun was found across comparable completions."
        : "More completed tasks with planned durations are needed for this comparison."));
  const d3Diagnostics: DetectorDiagnostics[] = [];
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

