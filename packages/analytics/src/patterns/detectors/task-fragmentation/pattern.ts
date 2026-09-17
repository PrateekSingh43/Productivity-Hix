import type { PatternLevelExecutionContext } from "../../base/context";
import { createPatternResult } from "../../base/detector";
import type {
  EpisodeMeasurementOutput,
  BehavioralPatternOutput,
  PatternExecutionStatus,
} from "@repo/types";
import type {
  TaskFragmentationConfig,
  TaskExecutionFragmentationMetrics,
  TaskExecutionBaselineEpisode,
  TaskExecutionFragmentationPatternMetrics,
} from "./types";
import { evaluateBaseline } from "../../baseline/engine";
import { median, recurrenceFraction, signedRelativeChange } from "../../baseline/statistics";
import { safeDivide } from "../../shared/math";
import { subtractCalendarDays, countDistinctCalendarDays } from "../../qualification/temporal";

/**
 * Evaluates the recurring Task Execution Fragmentation pattern across a temporal window.
 * 
 * Rules:
 * - Minimum qualifying episodes and calendar days in context.timezone required.
 * - Historical baseline population strictly bounded to [T_eval - baselineDays, T_eval).
 * - Anti-leakage strictly enforced.
 * - Both contrast (deltaFragmentation >= threshold) and recurrence (elevatedEpisodeFraction >= threshold)
 *   must be satisfied to emit DETECTED.
 * - Zero `any` casts.
 */
export function evaluateTaskFragmentationPattern(
  context: PatternLevelExecutionContext,
  evaluationId: string,
  patternId: string,
  episodes: EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[],
  historicalEpisodes: TaskExecutionBaselineEpisode[],
  config: TaskFragmentationConfig
): BehavioralPatternOutput<TaskExecutionFragmentationPatternMetrics> {
  const qualifyingEpisodes = episodes.filter((e) => e.executionStatus === "QUALIFIED");

  // Aggregate active duration and coverage
  let totalObservedActiveSeconds = 0;
  let totalWallClockSeconds = 0;
  let weightedCoverageSum = 0;

  // Aggregate gap composition across qualifying episodes
  const aggregateGapBreakdown = {
    breakSeconds: 0,
    otherTaskSeconds: 0,
    unattributedObservedSeconds: 0,
    explainedGapSeconds: 0,
    reportedUnobservedSeconds: 0,
  };

  for (const ep of qualifyingEpisodes) {
    totalObservedActiveSeconds += ep.activeDurationSeconds;
    const span = ep.metrics.wallClockSpanSeconds;
    totalWallClockSeconds += span;
    weightedCoverageSum += ep.coverageRatio * span;

    aggregateGapBreakdown.breakSeconds += ep.metrics.gapBreakdown.breakSeconds;
    aggregateGapBreakdown.otherTaskSeconds += ep.metrics.gapBreakdown.otherTaskSeconds;
    aggregateGapBreakdown.unattributedObservedSeconds += ep.metrics.gapBreakdown.unattributedObservedSeconds;
    aggregateGapBreakdown.explainedGapSeconds += ep.metrics.gapBreakdown.explainedGapSeconds;
    aggregateGapBreakdown.reportedUnobservedSeconds += ep.metrics.gapBreakdown.reportedUnobservedSeconds ?? 0;
  }

  const meanTelemetryCoverageRatio =
    totalWallClockSeconds > 0
      ? (safeDivide(weightedCoverageSum, totalWallClockSeconds) ?? 0)
      : 0;

  let executionStatus: PatternExecutionStatus = "NO_PATTERN";

  // 1. Evidence sufficiency check
  const distinctDays = countDistinctCalendarDays(
    qualifyingEpisodes.map((e) => e.temporalWindow.start),
    context.timezone
  );

  if (
    qualifyingEpisodes.length < config.minimumQualifyingEpisodes ||
    distinctDays < config.minimumQualifyingCalendarDays
  ) {
    executionStatus = "INSUFFICIENT_EVIDENCE";
  } else if (
    meanTelemetryCoverageRatio < config.minimumPatternCoverageRatio ||
    totalObservedActiveSeconds <= 0
  ) {
    executionStatus = "INDETERMINATE_COVERAGE";
  }

  // 2. Baseline calculation: strictly precedes evaluation start
  const baselineWindowEnd = context.timeline.windowStart;
  const baselineWindowStart = subtractCalendarDays(
    baselineWindowEnd,
    config.minimumBaselineDays,
    context.timezone
  );

  const baselineResult = evaluateBaseline<TaskExecutionBaselineEpisode>(
    historicalEpisodes,
    { start: baselineWindowStart, end: baselineWindowEnd },
    context.timeline.windowStart,
    {
      populationType: "completed_task_episodes",
      metricName: "wallClockFragmentationRatio",
      strategy: "median",
      qualifier: (ep) =>
        ep.unknownFraction <= config.maxUnknownFraction &&
        ep.activeTaskDurationSeconds >= config.minimumEpisodeActiveDurationSeconds &&
        ep.wallClockFragmentationRatio !== null,
      timestampExtractor: (ep) => ep.startedAt,
      metricExtractor: (ep) => ep.wallClockFragmentationRatio,
      aggregator: (vals) => median(vals),
      minimumPopulationCount: config.minimumBaselineEpisodes,
      minimumDistinctDays: config.minimumBaselineDistinctDays,
      timezone: context.timezone,
    }
  );

  let baselineMedianFragmentation: number | null = null;
  let deltaFragmentation: number | null = null;
  let deltaRatio: number | null = null;
  let comparisonStatus:
    | "EVALUATED"
    | "INSUFFICIENT_BASELINE_DATA"
    | "NOT_APPLICABLE"
    | "UNDEFINED_ZERO_BASELINE" = "NOT_APPLICABLE";

  let elevatedEpisodeFraction: number | null = null;
  let currentMedianFragmentation: number | null = null;
  let currentMedianActiveDurationSeconds: number | null = null;
  let currentMedianFragmentCount: number | null = null;

  if (executionStatus !== "INSUFFICIENT_EVIDENCE" && executionStatus !== "INDETERMINATE_COVERAGE") {
    if (baselineResult.status === "INSUFFICIENT_BASELINE_DATA") {
      executionStatus = "INSUFFICIENT_BASELINE_DATA";
      comparisonStatus = "INSUFFICIENT_BASELINE_DATA";
    } else if (baselineResult.status === "VALID") {
      baselineMedianFragmentation = baselineResult.aggregatedValue;

      const currentRatios = qualifyingEpisodes
        .map((e) => e.metrics.wallClockFragmentationRatio)
        .filter((v): v is number => v !== null);

      currentMedianFragmentation = median(currentRatios);
      currentMedianActiveDurationSeconds = median(
        qualifyingEpisodes.map((e) => e.metrics.activeTaskDurationSeconds)
      );
      currentMedianFragmentCount = median(
        qualifyingEpisodes.map((e) => e.metrics.fragmentCount)
      );

      if (currentMedianFragmentation !== null && baselineMedianFragmentation !== null) {
        deltaFragmentation = currentMedianFragmentation - baselineMedianFragmentation;
      }

      if (baselineMedianFragmentation === null || baselineMedianFragmentation <= 0) {
        comparisonStatus = "UNDEFINED_ZERO_BASELINE";
        deltaRatio = null;
      } else {
        comparisonStatus = "EVALUATED";
        deltaRatio = signedRelativeChange(currentMedianFragmentation, baselineMedianFragmentation);
      }

      // Recurrence evaluation against baseline reference
      const comparisonThreshold = baselineMedianFragmentation ?? 0;
      const elevatedEpisodes = qualifyingEpisodes.filter(
        (e) =>
          e.metrics.wallClockFragmentationRatio !== null &&
          e.metrics.wallClockFragmentationRatio > comparisonThreshold
      ).length;

      elevatedEpisodeFraction = recurrenceFraction(elevatedEpisodes, qualifyingEpisodes.length);

      // Contrast and Recurrence decisions
      const contrastPasses =
        deltaFragmentation !== null &&
        deltaFragmentation >= config.fragmentationContrastThreshold;

      const recurrencePasses =
        elevatedEpisodeFraction !== null &&
        elevatedEpisodeFraction >= config.fragmentationRecurrenceThreshold;

      if (contrastPasses && recurrencePasses) {
        executionStatus = "DETECTED";
      } else {
        executionStatus = "NO_PATTERN";
      }
    }
  }

  // Canonicalize contributing IDs deterministically
  const contributingTaskIds = Array.from(
    new Set(
      qualifyingEpisodes
        .map((e) => e.episodeEvidence.taskId)
        .filter((id): id is string => Boolean(id))
    )
  ).sort();

  const contributingSessionIds = Array.from(
    new Set(
      qualifyingEpisodes
        .map((e) => e.episodeEvidence.sessionId)
        .filter((id): id is string => Boolean(id))
    )
  ).sort();

  return createPatternResult<TaskExecutionFragmentationPatternMetrics>(
    context,
    evaluationId,
    patternId,
    executionStatus,
    {
      patternType: "task_execution_fragmentation",
      taxonomy: "context_dynamics",
      temporalWindow: {
        start: context.timeline.windowStart,
        end: context.timeline.windowEnd,
        scale: "14_DAY",
      },
      sample: {
        qualifyingDays: distinctDays,
        qualifyingEpisodes: qualifyingEpisodes.length,
        totalObservedHours: totalObservedActiveSeconds / 3600,
        meanCoverageRatio: meanTelemetryCoverageRatio,
      },
      baseline: {
        strategy: config.baselineStrategy ?? "ROLLING_14_DAY_WINDOW",
        comparedMetric: "wallClockFragmentationRatio",
        baselineValue: baselineMedianFragmentation,
        currentValue: currentMedianFragmentation,
        deltaRatio: deltaRatio ?? deltaFragmentation,
        comparisonStatus,
      },
      metrics: {
        currentMedianFragmentation,
        currentMedianActiveDurationSeconds,
        currentMedianFragmentCount,
        elevatedEpisodeFraction,
        deltaFragmentation,
        gapComposition: aggregateGapBreakdown,
      },
      reliability: {
        tier: "PROVISIONAL",
        calibrationStatus: "UNVALIDATED_PROTOTYPE",
        evidenceQualityFactors: {
          qualifyingDayCount: distinctDays,
          qualifyingEpisodeCount: qualifyingEpisodes.length,
          meanTelemetryCoverageRatio,
          temporalVariability: null,
          baselineMaturityDays: config.minimumBaselineDays,
          hasCorroboratingSelfReport: false,
        },
      },
      evidenceReferences: {
        contributingTaskIds,
        contributingSessionIds,
        sampleBoundingWindows: [
          { start: context.timeline.windowStart, end: context.timeline.windowEnd },
        ],
      },
      epistemicCaveats: [],
    }
  );
}
