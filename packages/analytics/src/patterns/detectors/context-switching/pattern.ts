import type { PatternLevelExecutionContext } from "../../base/context";
import { createPatternResult } from "../../base/detector";
import type { EpisodeMeasurementOutput } from "@repo/types";
import type { ContextSwitchingConfig, ContextSwitchingMetrics, ContextSwitchingBaselineSession, ContextSwitchingPatternMetrics } from "./types";
import { evaluateBaseline } from "../../baseline/engine";
import { median, recurrenceFraction, signedRelativeChange } from "../../baseline/statistics";
import { safeDivide } from "../../shared/math";
import { subtractCalendarDays, countDistinctCalendarDays } from "../../qualification/temporal";

export function evaluateContextSwitchingPattern(
  context: PatternLevelExecutionContext,
  evaluationId: string,
  patternId: string,
  episodes: EpisodeMeasurementOutput<ContextSwitchingMetrics>[],
  historicalSessions: ContextSwitchingBaselineSession[],
  config: ContextSwitchingConfig
) {
  // Aggregate episodes in the current window
  const qualifyingEpisodes = episodes.filter(e => e.executionStatus === "QUALIFIED");
  
  // Total active & duration for coverage aggregation
  let totalObservedActiveSeconds = 0;
  let totalSessionDurationSeconds = 0;
  
  for (const ep of qualifyingEpisodes) {
    totalObservedActiveSeconds += ep.activeDurationSeconds;
    // We expect the original session duration to be passed via activeDuration / coverageRatio.
    if (ep.coverageRatio > 0) {
      totalSessionDurationSeconds += (ep.activeDurationSeconds / ep.coverageRatio);
    }
  }

  const meanTelemetryCoverageRatio = safeDivide(totalObservedActiveSeconds, totalSessionDurationSeconds) ?? 0;
  
  let executionStatus = "NO_PATTERN" as any;
  
  // 1. Evidence sufficiency check
  const distinctDays = countDistinctCalendarDays(
    qualifyingEpisodes.map(e => e.temporalWindow.start),
    context.timezone
  );
  if (
    qualifyingEpisodes.length < config.minimumQualifyingSessions ||
    distinctDays < config.minimumQualifyingCalendarDays
  ) {
    executionStatus = "INSUFFICIENT_EVIDENCE";
  } else if (meanTelemetryCoverageRatio < config.minimumPatternCoverageRatio || totalObservedActiveSeconds <= 0) {
    executionStatus = "INDETERMINATE_COVERAGE";
  }

  // 2. Baseline calculation (30-day non-overlapping preceding window)
  const baselineWindow = {
    start: subtractCalendarDays(context.timeline.windowStart, 30, context.timezone),
    end: context.timeline.windowStart
  };

  const baselineResult = evaluateBaseline(
    historicalSessions,
    baselineWindow,
    context.timeline.windowStart,
    {
      populationType: "completed_sessions",
      metricName: "switchesPerHour",
      strategy: "median",
      qualifier: (session) => true,
      timestampExtractor: (session) => session.startedAt,
      metricExtractor: (session) => session.switchesPerHour,
      aggregator: (vals) => median(vals),
      minimumPopulationCount: config.minimumBaselineSessions,
      minimumDistinctDays: config.minimumBaselineDays
    }
  );

  let baselineMedianSwitchesPerHour: number | null = null;
  let deltaRatio: number | null = null;
  let comparisonStatus = "NOT_APPLICABLE" as any;
  let elevatedSessionFraction: number | null = null;
  let currentMedianSwitchesPerHour: number | null = null;
  let currentMedianDwellSeconds: number | null = null;
  let currentMedianIqrDwell: number | null = null;
  let currentMedianShortContextFraction: number | null = null;
  
  if (executionStatus !== "INSUFFICIENT_EVIDENCE" && executionStatus !== "INDETERMINATE_COVERAGE") {
    // Check baseline maturity
    if (baselineResult.status === "INSUFFICIENT_BASELINE_DATA") {
      executionStatus = "INSUFFICIENT_BASELINE_DATA";
      comparisonStatus = "INSUFFICIENT_BASELINE_DATA";
    } else if (baselineResult.status === "VALID") {
      baselineMedianSwitchesPerHour = baselineResult.aggregatedValue;
      
      currentMedianSwitchesPerHour = median(qualifyingEpisodes.map(e => e.metrics.switchesPerHour).filter(v => v !== null) as number[]);
      currentMedianDwellSeconds = median(qualifyingEpisodes.map(e => e.metrics.medianDwellSeconds).filter(v => v !== null) as number[]);
      currentMedianIqrDwell = median(qualifyingEpisodes.map(e => e.metrics.interquartileDwellSeconds).filter(v => v !== null) as number[]);
      currentMedianShortContextFraction = median(qualifyingEpisodes.map(e => e.metrics.shortContextFraction).filter(v => v !== null) as number[]);
      
      // Zero Baseline Guard
      if (baselineMedianSwitchesPerHour === null || baselineMedianSwitchesPerHour <= 0) {
        comparisonStatus = "UNDEFINED_ZERO_BASELINE";
        deltaRatio = null;
        
        // Evaluate absolute threshold
        if (currentMedianSwitchesPerHour !== null && currentMedianSwitchesPerHour >= config.absoluteElevatedSwitchThreshold) {
          // Contrast passes
        }
      } else {
        comparisonStatus = "EVALUATED";
        deltaRatio = signedRelativeChange(currentMedianSwitchesPerHour, baselineMedianSwitchesPerHour);
        
        // Contrast threshold
        if (deltaRatio !== null && deltaRatio >= config.switchContrastThreshold) {
          // Contrast passes
        }
      }
      
      // Recurrence
      const comparisonThreshold = (comparisonStatus === "UNDEFINED_ZERO_BASELINE")
        ? config.absoluteElevatedSwitchThreshold
        : (baselineMedianSwitchesPerHour ?? 0);
        
      const elevatedSessions = qualifyingEpisodes.filter(e => 
        e.metrics.switchesPerHour !== null && e.metrics.switchesPerHour > comparisonThreshold
      ).length;
      
      elevatedSessionFraction = recurrenceFraction(elevatedSessions, qualifyingEpisodes.length);
      
      const contrastPasses = comparisonStatus === "UNDEFINED_ZERO_BASELINE" 
        ? (currentMedianSwitchesPerHour !== null && currentMedianSwitchesPerHour >= config.absoluteElevatedSwitchThreshold)
        : (deltaRatio !== null && deltaRatio >= config.switchContrastThreshold);
        
      const recurrencePasses = elevatedSessionFraction !== null && elevatedSessionFraction >= config.switchRecurrenceThreshold;
      
      if (contrastPasses && recurrencePasses) {
        executionStatus = "DETECTED";
      } else if (executionStatus !== "INSUFFICIENT_BASELINE_DATA") {
        executionStatus = "NO_PATTERN";
      }
    }
  }

  // Canonicalize IDs
  const contributingSessionIds = qualifyingEpisodes.map(e => e.episodeEvidence.sessionId!).sort();

  return createPatternResult<ContextSwitchingPatternMetrics>(
    context,
    evaluationId,
    patternId,
    executionStatus,
    {
      patternType: "context_switching_density",
      taxonomy: "context_dynamics",
      temporalWindow: {
        start: context.timeline.windowStart,
        end: context.timeline.windowEnd,
        scale: "14_DAY"
      },
      sample: {
        qualifyingDays: distinctDays,
        qualifyingEpisodes: qualifyingEpisodes.length,
        totalObservedHours: totalObservedActiveSeconds / 3600,
        meanCoverageRatio: meanTelemetryCoverageRatio
      },
      baseline: {
        strategy: "PERSONAL_30_DAY",
        comparedMetric: "switchesPerHour",
        baselineValue: baselineMedianSwitchesPerHour,
        currentValue: median(qualifyingEpisodes.map(e => e.metrics.switchesPerHour).filter(v => v !== null) as number[]),
        deltaRatio,
        comparisonStatus
      },
      metrics: {
        switchesPerHour: currentMedianSwitchesPerHour,
        medianDwellSeconds: currentMedianDwellSeconds,
        interquartileDwellSeconds: currentMedianIqrDwell,
        shortContextFraction: currentMedianShortContextFraction,
        elevatedSessionFraction
      },
      reliability: {
        tier: "PROVISIONAL",
        calibrationStatus: "UNVALIDATED_PROTOTYPE",
        evidenceQualityFactors: {
          qualifyingDayCount: distinctDays,
          qualifyingEpisodeCount: qualifyingEpisodes.length,
          meanTelemetryCoverageRatio,
          temporalVariability: null,
          baselineMaturityDays: 14, // Assuming mature if reached here
          hasCorroboratingSelfReport: false
        }
      },
      evidenceReferences: {
        contributingSessionIds,
        sampleBoundingWindows: [{ start: context.timeline.windowStart, end: context.timeline.windowEnd }]
      },
      epistemicCaveats: []
    }
  );
}
