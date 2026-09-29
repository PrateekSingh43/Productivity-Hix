import type { PatternExecutionStatus } from "@repo/types";
import type { PatternLevelExecutionContext } from "../../base/context";import { createPatternResult } from "../../base/detector";
import { median, recurrenceFraction, signedRelativeChange } from "../../baseline/statistics";
import { safeDivide } from "../../shared/math";
import type {
  GoldenHoursConfig,
  GoldenHoursDayEpisode,
  GoldenHoursPatternMetrics,
} from "./types";

/**
 * Golden-hours pattern evaluation (pure/deterministic).
 *
 * Purpose: decide whether recorded mornings are calmer than afternoons across
 * qualifying days. Median AM vs median PM switches/hr set the contrast;
 * directional share (supporting days / qualifying days) sets recurrence.
 *
 * Units: switches/hour; contrast is a signed relative change of the AM median
 * against the PM median (negative when mornings are calmer). Assumes
 * day-episodes carry local dates and both medians summarize the same
 * qualifying-day population.
 *
 * Edge cases: below-minimum populations report INSUFFICIENT_EVIDENCE;
 * sub-floor coverage reports INDETERMINATE_COVERAGE; an immature baseline
 * (fewer than minimumBaselineDayEpisodes/baselineDays) reports
 * INSUFFICIENT_BASELINE_DATA even when the current-window contrast is strong
 * (mirrors D1: no evaluated own-history reference, no DETECTED). DETECTED
 * requires the AM-calmer direction only; a stable PM-calmer contrast reports
 * NO_PATTERN because this detector answers "are mornings golden?", not the
 * reverse. Baseline medians reuse the identical AM/PM window measurement.
 */

function finiteRates(episodes: GoldenHoursDayEpisode[], pick: (episode: GoldenHoursDayEpisode) => number | null): number[] {
  return episodes.map(pick).filter((value): value is number => value !== null && Number.isFinite(value));
}

export function evaluateGoldenHoursPattern(
  context: PatternLevelExecutionContext,
  evaluationId: string,
  patternId: string,
  episodes: GoldenHoursDayEpisode[],
  baselineEpisodes: GoldenHoursDayEpisode[],
  config: GoldenHoursConfig,
) {
  const qualifying = episodes.filter((episode) => episode.executionStatus === "QUALIFIED");
  const distinctDays = new Set(qualifying.map((episode) => episode.date)).size;
  const totalSpanSeconds = qualifying.reduce((sum, episode) => sum + episode.windowSpanSeconds, 0);
  const totalObservedSeconds = qualifying.reduce((sum, episode) => sum + episode.observedSeconds, 0);
  const totalUnknownSeconds = qualifying.reduce(
    (sum, episode) => sum + episode.unknownFraction * episode.windowSpanSeconds,
    0,
  );
  const meanTelemetryCoverageRatio = safeDivide(totalObservedSeconds, totalSpanSeconds) ?? 0;
  const unknownFraction = safeDivide(totalUnknownSeconds, totalSpanSeconds) ?? 1;

  let executionStatus: PatternExecutionStatus = "NO_PATTERN";
  if (
    qualifying.length < config.minimumQualifyingDayEpisodes ||
    distinctDays < config.minimumQualifyingCalendarDays
  ) {
    executionStatus = "INSUFFICIENT_EVIDENCE";
  } else if (meanTelemetryCoverageRatio < config.minimumPatternCoverageRatio || totalObservedSeconds <= 0) {
    executionStatus = "INDETERMINATE_COVERAGE";
  }

  const amRates = finiteRates(qualifying, (episode) => episode.am.switchesPerHour);
  const pmRates = finiteRates(qualifying, (episode) => episode.pm.switchesPerHour);
  const amMedian = median(amRates);
  const pmMedian = median(pmRates);
  const contrast = signedRelativeChange(amMedian, pmMedian);
  const supportingDays = qualifying.filter((episode) => episode.supportsAmCalmer).length;
  const directionalShare = recurrenceFraction(supportingDays, qualifying.length);

  const amFocusMeans = finiteRates(qualifying, (episode) => episode.am.meanFocusScore);
  const pmFocusMeans = finiteRates(qualifying, (episode) => episode.pm.meanFocusScore);
  const focusDays = qualifying.filter(
    (episode) => episode.am.meanFocusScore !== null && episode.pm.meanFocusScore !== null,
  ).length;

  const baselineQualifying = baselineEpisodes.filter((episode) => episode.executionStatus === "QUALIFIED");
  const baselineDays = new Set(baselineQualifying.map((episode) => episode.date)).size;
  const baselineMature =
    baselineQualifying.length >= config.minimumBaselineDayEpisodes && baselineDays >= config.minimumBaselineDays;
  const baselinePmMedian = median(finiteRates(baselineQualifying, (episode) => episode.pm.switchesPerHour));
  const currentValue = amMedian;
  const deltaRatio = signedRelativeChange(currentValue, baselinePmMedian);

  if (executionStatus !== "INSUFFICIENT_EVIDENCE" && executionStatus !== "INDETERMINATE_COVERAGE") {
    if (!baselineMature) {
      executionStatus = "INSUFFICIENT_BASELINE_DATA";
    } else if (
      contrast !== null &&
      contrast <= -config.contrastThreshold &&
      directionalShare !== null &&
      directionalShare >= config.directionalShareThreshold
    ) {
      executionStatus = "DETECTED";
    } else {
      executionStatus = "NO_PATTERN";
    }
  }

  const contributingSessionIds = [...new Set(qualifying.flatMap((episode) => episode.sessionIds))].sort();

  return createPatternResult<GoldenHoursPatternMetrics>(
    context,
    evaluationId,
    patternId,
    executionStatus,
    {
      patternType: "golden_hours_focus",
      taxonomy: "temporal_distribution",
      temporalWindow: {
        start: context.timeline.windowStart,
        end: context.timeline.windowEnd,
        scale: "14_DAY",
      },
      sample: {
        qualifyingDays: distinctDays,
        qualifyingEpisodes: qualifying.length,
        totalObservedHours: totalObservedSeconds / 3600,
        meanCoverageRatio: meanTelemetryCoverageRatio,
      },
      baseline: {
        strategy: "PERSONAL_30_DAY",
        comparedMetric: "switchesPerHour",
        baselineValue: baselinePmMedian,
        currentValue,
        deltaRatio,
        comparisonStatus: baselineMature ? "EVALUATED" : "INSUFFICIENT_BASELINE_DATA",
      },
      metrics: {
        amMedianSwitchesPerHour: amMedian,
        pmMedianSwitchesPerHour: pmMedian,
        contrast,
        supportingDays,
        amMedianFocusScore: median(amFocusMeans),
        pmMedianFocusScore: median(pmFocusMeans),
        focusDays,
      },
      reliability: {
        tier: "PROVISIONAL",
        calibrationStatus: "UNVALIDATED_PROTOTYPE",
        evidenceQualityFactors: {
          qualifyingDayCount: distinctDays,
          qualifyingEpisodeCount: qualifying.length,
          meanTelemetryCoverageRatio,
          temporalVariability: null,
          baselineMaturityDays: baselineDays,
          hasCorroboratingSelfReport: focusDays > 0,
        },
      },
      evidenceReferences: {
        contributingSessionIds,
        sampleBoundingWindows: [{ start: context.timeline.windowStart, end: context.timeline.windowEnd }],
      },
      epistemicCaveats: [],
    },
  );
}
