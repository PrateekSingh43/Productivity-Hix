import type { BehavioralPatternOutput, EpisodeMeasurementOutput, PatternExecutionStatus } from "@repo/types";
import type { PatternLevelExecutionContext } from "../../base/context";
import { createPatternResult } from "../../base/detector";
import { recurrenceFraction } from "../../baseline/statistics";
import { safeDivide } from "../../shared/math";
import { countDistinctCalendarDays } from "../../qualification/temporal";
import type { EscapeHatchConfig, EscapeHatchEpisodeMetrics, EscapeHatchPatternMetrics } from "./types";

/**
 * Evaluates recurring escape-hatch co-occurrence across task onsets (Tier 2).
 *
 * Purpose: decide whether escape-context activity recurrently follows
 * friction near recorded task starts. The escape share (escaped friction
 * occasions / friction occasions) sets recurrence.
 *
 * Units: escapeShare is a fraction in [0, 1]. Assumes episode outputs carry
 * honest assessment-window coverage accounting.
 *
 * Edge cases: below-minimum populations report INSUFFICIENT_EVIDENCE;
 * sub-floor mean coverage reports INDETERMINATE_COVERAGE. DETECTED requires
 * the escape share at or above escapeShareThreshold. The baseline strategy
 * is NONE: the reference is the declared task onset itself, so no
 * own-history maturity gate applies. claimLevel stays co-occurrence — the
 * output never supports a causal reading.
 */
export function evaluateEscapeHatchPattern(
  context: PatternLevelExecutionContext,
  evaluationId: string,
  patternId: string,
  episodes: EpisodeMeasurementOutput<EscapeHatchEpisodeMetrics>[],
  config: EscapeHatchConfig,
): BehavioralPatternOutput<EscapeHatchPatternMetrics> {
  const qualifying = episodes.filter((episode) => episode.executionStatus === "QUALIFIED");
  const escaped = qualifying.filter((episode) => episode.metrics.escaped);
  const escapeShare = recurrenceFraction(escaped.length, qualifying.length);
  const distinctDays = countDistinctCalendarDays(
    qualifying.map((episode) => episode.metrics.taskStart),
    context.timezone,
  );
  const totalSpan = qualifying.reduce((sum, episode) => sum + episode.metrics.assessmentSpanSeconds, 0);
  const totalObserved = qualifying.reduce((sum, episode) => sum + episode.metrics.assessmentObservedSeconds, 0);
  const totalUnknown = qualifying.reduce((sum, episode) => sum + episode.metrics.assessmentUnknownSeconds, 0);
  const meanCoverageRatio = safeDivide(totalObserved, totalSpan) ?? 0;
  const unknownFraction = safeDivide(totalUnknown, totalSpan) ?? 1;
  const totalObservedHours =
    qualifying.reduce((sum, episode) => sum + episode.activeDurationSeconds, 0) / 3600;

  let executionStatus: PatternExecutionStatus = "NO_PATTERN";
  if (
    qualifying.length < config.minimumQualifyingTaskStarts ||
    distinctDays < config.minimumDistinctCalendarDays
  ) {
    executionStatus = "INSUFFICIENT_EVIDENCE";
  } else if (meanCoverageRatio < config.minimumPatternCoverageRatio || totalObserved <= 0) {
    executionStatus = "INDETERMINATE_COVERAGE";
  } else if (escapeShare !== null && escapeShare >= config.escapeShareThreshold) {
    executionStatus = "DETECTED";
  } else {
    executionStatus = "NO_PATTERN";
  }

  return createPatternResult<EscapeHatchPatternMetrics>(
    context,
    evaluationId,
    patternId,
    executionStatus,
    {
      patternType: "escape_hatch",
      taxonomy: "execution_friction",
      temporalWindow: {
        start: context.timeline.windowStart,
        end: context.timeline.windowEnd,
        scale: "14_DAY",
      },
      sample: {
        qualifyingDays: distinctDays,
        qualifyingEpisodes: qualifying.length,
        totalObservedHours,
        meanCoverageRatio,
      },
      baseline: {
        strategy: "NONE",
        comparedMetric: "escapeShare",
        baselineValue: null,
        currentValue: escapeShare,
        deltaRatio: null,
        comparisonStatus: "NOT_APPLICABLE",
      },
      metrics: {
        escapeShare,
        escapedStarts: escaped.length,
        qualifyingStarts: qualifying.length,
        totalStarts: episodes.length,
      },
      reliability: {
        tier: "PROVISIONAL",
        calibrationStatus: "UNVALIDATED_PROTOTYPE",
        evidenceQualityFactors: {
          qualifyingDayCount: distinctDays,
          qualifyingEpisodeCount: qualifying.length,
          meanTelemetryCoverageRatio: meanCoverageRatio,
          temporalVariability: null,
          baselineMaturityDays: 0,
          hasCorroboratingSelfReport: false,
        },
      },
      evidenceReferences: {
        contributingSessionIds: qualifying.map((episode) => episode.metrics.sessionId).sort(),
        contributingTaskIds: [...new Set(qualifying.map((episode) => episode.metrics.taskId))].sort(),
        sampleBoundingWindows: [
          { start: context.timeline.windowStart, end: context.timeline.windowEnd },
        ],
      },
      epistemicCaveats: ["CO_OCCURRENCE_ONLY"],
    },
  );
}
