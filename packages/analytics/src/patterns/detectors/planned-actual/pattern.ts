import type { BehavioralPatternOutput, EpisodeMeasurementOutput, PatternExecutionStatus } from "@repo/types";
import type { PatternLevelExecutionContext } from "../../base/context";
import { createPatternResult } from "../../base/detector";
import { median, recurrenceFraction } from "../../baseline/statistics";
import { safeDivide } from "../../shared/math";
import { countDistinctCalendarDays } from "../../qualification/temporal";
import type { PlannedActualConfig, PlannedActualEpisodeMetrics, PlannedActualPatternMetrics } from "./types";

/**
 * Evaluates recurring planned-vs-actual duration bias (Tier 2 pattern).
 *
 * Purpose: decide whether completed tasks recurrently run longer than
 * planned. The median bias ratio sets the contrast; the overrun share
 * (tasks at/above the overrun ratio / qualifying tasks) sets recurrence.
 *
 * Units: biasRatio is unitless (actual / planned). Assumes episode outputs
 * carry honest per-task bias measurements.
 *
 * Edge cases: below-minimum populations report INSUFFICIENT_EVIDENCE.
 * DETECTED requires BOTH a median bias at or above overrunRatioThreshold
 * AND an overrun share at or above overrunShareThreshold — a skewed median
 * from a minority of overruns is not a recurrent bias. Only overrun is
 * detected; systematic underruns report NO_PATTERN because this detector
 * answers "do I underestimate?", not the reverse. The baseline strategy is
 * NONE: the reference is the declared plan itself.
 */
export function evaluatePlannedActualPattern(
  context: PatternLevelExecutionContext,
  evaluationId: string,
  patternId: string,
  episodes: EpisodeMeasurementOutput<PlannedActualEpisodeMetrics>[],
  config: PlannedActualConfig,
): BehavioralPatternOutput<PlannedActualPatternMetrics> {
  const qualifying = episodes.filter((episode) => episode.executionStatus === "QUALIFIED");
  const ratios = qualifying
    .map((episode) => episode.metrics.biasRatio)
    .filter((ratio): ratio is number => ratio !== null && Number.isFinite(ratio));
  const medianBias = ratios.length ? median(ratios) : null;
  const meanBias = ratios.length
    ? safeDivide(ratios.reduce((sum, ratio) => sum + ratio, 0), ratios.length)
    : null;
  const overruns = qualifying.filter((episode) => episode.metrics.supportsOverrun).length;
  const overrunShare = recurrenceFraction(overruns, qualifying.length);
  const distinctDays = countDistinctCalendarDays(
    qualifying
      .map((episode) => episode.metrics.completedAt)
      .filter((completed): completed is string => completed !== null),
    context.timezone,
  );
  const totalObservedHours =
    qualifying.reduce((sum, episode) => sum + episode.activeDurationSeconds, 0) / 3600;

  let executionStatus: PatternExecutionStatus = "NO_PATTERN";
  if (
    qualifying.length < config.minimumQualifyingCompletedTasks ||
    distinctDays < config.minimumDistinctCalendarDays
  ) {
    executionStatus = "INSUFFICIENT_EVIDENCE";
  } else if (
    medianBias !== null &&
    medianBias >= config.overrunRatioThreshold &&
    overrunShare !== null &&
    overrunShare >= config.overrunShareThreshold
  ) {
    executionStatus = "DETECTED";
  } else {
    executionStatus = "NO_PATTERN";
  }

  return createPatternResult<PlannedActualPatternMetrics>(
    context,
    evaluationId,
    patternId,
    executionStatus,
    {
      patternType: "planned_vs_actual",
      taxonomy: "schedule_fidelity",
      temporalWindow: {
        start: context.timeline.windowStart,
        end: context.timeline.windowEnd,
        scale: "14_DAY",
      },
      sample: {
        qualifyingDays: distinctDays,
        qualifyingEpisodes: qualifying.length,
        totalObservedHours,
        meanCoverageRatio: 1.0,
      },
      baseline: {
        strategy: "NONE",
        comparedMetric: "biasRatio",
        baselineValue: null,
        currentValue: medianBias,
        deltaRatio: null,
        comparisonStatus: "NOT_APPLICABLE",
      },
      metrics: {
        medianBiasRatio: medianBias,
        meanBiasRatio: meanBias,
        overrunShare,
        overrunTaskCount: overruns,
        qualifyingTaskCount: qualifying.length,
        totalTaskCount: episodes.length,
      },
      reliability: {
        tier: "PROVISIONAL",
        calibrationStatus: "UNVALIDATED_PROTOTYPE",
        evidenceQualityFactors: {
          qualifyingDayCount: distinctDays,
          qualifyingEpisodeCount: qualifying.length,
          meanTelemetryCoverageRatio: 1.0,
          temporalVariability: null,
          baselineMaturityDays: 0,
          hasCorroboratingSelfReport: false,
        },
      },
      evidenceReferences: {
        contributingTaskIds: qualifying.map((episode) => episode.metrics.taskId).sort(),
        contributingSessionIds: [
          ...new Set(
            qualifying.flatMap((episode) =>
              episode.episodeEvidence.sessionId ? [episode.episodeEvidence.sessionId] : [],
            ),
          ),
        ].sort(),
        sampleBoundingWindows: [
          { start: context.timeline.windowStart, end: context.timeline.windowEnd },
        ],
      },
      epistemicCaveats: [],
    },
  );
}
