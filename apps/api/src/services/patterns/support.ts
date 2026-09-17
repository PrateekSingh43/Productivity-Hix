import type { AnalyticalWindow, EvidenceTimeline } from "@repo/types";
import {
  PatternExecutionContext, type DetectorIdentity, type EpisodeExecutionContext, type PatternLevelExecutionContext,
  type ContextSwitchingConfig, type TaskFragmentationConfig,
} from "@repo/analytics";

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
  maxUnknownFraction: 0.2, detectorVersion: "1.0.0", configurationVersion: "api-prototype-1",
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

export function executionContext(userId: string, timezone: string, timeline: EvidenceTimeline, identity: DetectorIdentity) {
  return new PatternExecutionContext({
    userId, timezone, timeline, level: "PATTERN",
    config: {
      detectorIdentity: identity, detectorVersion: "1.0.0", configurationVersion: "api-prototype-1",
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

export const windowOf = (timeline: EvidenceTimeline): AnalyticalWindow => ({ start: timeline.windowStart, end: timeline.windowEnd });
