import type { EpisodeExecutionContext } from "../../base/context";
import { createEpisodeResult } from "../../base/detector";
import type { EpisodeMeasurementOutput, EpisodeExecutionStatus, TemporalEvidenceBlock } from "@repo/types";
import type { TaskFragmentationConfig, TaskExecutionFragmentationMetrics } from "./types";
import { segmentTaskExecutionEpisodes, findAuthoritativeTaskIds } from "./sequence";

/**
 * Evaluates a single bounded task execution episode.
 * 
 * Rules:
 * - Authoritative taskId must be present with linkType === "EXPLICIT".
 * - If unknownFraction > maxUnknownFraction (candidate 0.20) -> INDETERMINATE_COVERAGE.
 * - If activeTaskDurationSeconds < minimumEpisodeActiveDurationSeconds -> INSUFFICIENT_EVIDENCE.
 * - Preserves exact conservation: wallClockSpan = activeTask + knownGaps + unknown.
 * - Zero `any` casts.
 */
export function evaluateTaskFragmentationEpisode(
  context: EpisodeExecutionContext,
  evaluationId: string,
  blocks: TemporalEvidenceBlock[],
  config: TaskFragmentationConfig,
  targetTaskId?: string
): EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics> {
  const epistemicCaveats: string[] = [];

  // Determine authoritative target taskId
  let resolvedTaskId = targetTaskId;
  if (!resolvedTaskId) {
    const authoritativeIds = findAuthoritativeTaskIds(blocks);
    if (authoritativeIds.includes(context.canonicalSessionId)) {
      resolvedTaskId = context.canonicalSessionId;
    } else if (authoritativeIds.length === 1) {
      resolvedTaskId = authoritativeIds[0];
    } else if (authoritativeIds.length > 1) {
      // Pick the primary taskId deterministically (first alphabetically)
      resolvedTaskId = authoritativeIds[0];
      epistemicCaveats.push(
        `Multiple authoritative tasks detected in window; evaluating primary task ${resolvedTaskId}.`
      );
    }
  }

  // If still no authoritative taskId, return INSUFFICIENT_EVIDENCE
  if (!resolvedTaskId) {
    const emptyMetrics: TaskExecutionFragmentationMetrics = {
      taskId: "unknown",
      fragmentCount: 0,
      wallClockSpanSeconds: 0,
      activeTaskDurationSeconds: 0,
      knownInterveningGapSeconds: 0,
      unknownSeconds: 0,
      unknownFraction: 0,
      wallClockFragmentationRatio: null,
      medianFragmentDurationSeconds: null,
      longestFragmentDurationSeconds: null,
      interquartileFragmentDurationSeconds: null,
      medianInterveningGapSeconds: null,
      gapBreakdown: {
        breakSeconds: 0,
        otherTaskSeconds: 0,
        unattributedObservedSeconds: 0,
        explainedGapSeconds: 0,
      },
    };

    return createEpisodeResult<TaskExecutionFragmentationMetrics>(
      context,
      evaluationId,
      "INSUFFICIENT_EVIDENCE",
      {
        taxonomy: "context_dynamics",
        temporalWindow: {
          start: context.timeline.windowStart,
          end: context.timeline.windowEnd,
          scale: "TASK_INSTANCE",
        },
        episodeEvidence: {
          sessionId: context.canonicalSessionId,
          taskId: undefined,
          boundingWindow: {
            start: context.timeline.windowStart,
            end: context.timeline.windowEnd,
          },
        },
        activeDurationSeconds: 0,
        coverageRatio: 0,
        metrics: emptyMetrics,
        epistemicCaveats: ["No authoritative explicit task linkage found in episode window."],
      }
    );
  }

  // Segment blocks into bounded task episodes
  const episodes = segmentTaskExecutionEpisodes(blocks, resolvedTaskId, {
    continuationGapThresholdSeconds: config.continuationGapThresholdSeconds,
    timezone: context.timezone,
    maxUnknownFraction: config.maxUnknownFraction,
  });

  if (episodes.length === 0) {
    const emptyMetrics: TaskExecutionFragmentationMetrics = {
      taskId: resolvedTaskId,
      fragmentCount: 0,
      wallClockSpanSeconds: 0,
      activeTaskDurationSeconds: 0,
      knownInterveningGapSeconds: 0,
      unknownSeconds: 0,
      unknownFraction: 0,
      wallClockFragmentationRatio: null,
      medianFragmentDurationSeconds: null,
      longestFragmentDurationSeconds: null,
      interquartileFragmentDurationSeconds: null,
      medianInterveningGapSeconds: null,
      gapBreakdown: {
        breakSeconds: 0,
        otherTaskSeconds: 0,
        unattributedObservedSeconds: 0,
        explainedGapSeconds: 0,
      },
    };

    return createEpisodeResult<TaskExecutionFragmentationMetrics>(
      context,
      evaluationId,
      "INSUFFICIENT_EVIDENCE",
      {
        taxonomy: "context_dynamics",
        temporalWindow: {
          start: context.timeline.windowStart,
          end: context.timeline.windowEnd,
          scale: "TASK_INSTANCE",
        },
        episodeEvidence: {
          sessionId: context.canonicalSessionId,
          taskId: resolvedTaskId,
          boundingWindow: {
            start: context.timeline.windowStart,
            end: context.timeline.windowEnd,
          },
        },
        activeDurationSeconds: 0,
        coverageRatio: 0,
        metrics: emptyMetrics,
        epistemicCaveats: ["No active task execution fragments observed for task."],
      }
    );
  }

  // Use the primary bounded episode
  const episode = episodes[0]!;

  let executionStatus: EpisodeExecutionStatus = "QUALIFIED";

  // Coverage qualification rule: unknownFraction > maxUnknownFraction => INDETERMINATE_COVERAGE
  if (episode.unknownFraction > config.maxUnknownFraction) {
    executionStatus = "INDETERMINATE_COVERAGE";
    epistemicCaveats.push(
      `Unmonitored interval fraction (${(episode.unknownFraction * 100).toFixed(1)}%) exceeds threshold (${(config.maxUnknownFraction * 100).toFixed(1)}%).`
    );
  } else if (episode.activeTaskDurationSeconds < config.minimumEpisodeActiveDurationSeconds) {
    executionStatus = "INSUFFICIENT_EVIDENCE";
    epistemicCaveats.push(
      `Active execution duration (${episode.activeTaskDurationSeconds}s) is below required qualification minimum (${config.minimumEpisodeActiveDurationSeconds}s).`
    );
  } else if (episode.wallClockSpanSeconds <= 0) {
    executionStatus = "INSUFFICIENT_EVIDENCE";
    epistemicCaveats.push("Wall-clock span is non-positive.");
  }

  const coverageRatio = Math.max(0, Math.min(1, 1 - episode.unknownFraction));

  const metrics: TaskExecutionFragmentationMetrics = {
    taskId: resolvedTaskId,
    fragmentCount: episode.fragmentCount,
    wallClockSpanSeconds: episode.wallClockSpanSeconds,
    activeTaskDurationSeconds: episode.activeTaskDurationSeconds,
    knownInterveningGapSeconds: episode.knownInterveningGapSeconds,
    unknownSeconds: episode.unknownSeconds,
    unknownFraction: episode.unknownFraction,
    wallClockFragmentationRatio: episode.wallClockFragmentationRatio,
    medianFragmentDurationSeconds: episode.medianFragmentDurationSeconds,
    longestFragmentDurationSeconds: episode.longestFragmentDurationSeconds,
    interquartileFragmentDurationSeconds: episode.interquartileFragmentDurationSeconds,
    medianInterveningGapSeconds: episode.medianInterveningGapSeconds,
    gapBreakdown: episode.gapBreakdown,
  };

  return createEpisodeResult<TaskExecutionFragmentationMetrics>(
    context,
    evaluationId,
    executionStatus,
    {
      taxonomy: "context_dynamics",
      temporalWindow: {
        start: episode.startedAt,
        end: episode.endedAt,
        scale: "TASK_INSTANCE",
      },
      episodeEvidence: {
        sessionId: context.canonicalSessionId,
        taskId: resolvedTaskId,
        boundingWindow: {
          start: episode.startedAt,
          end: episode.endedAt,
        },
      },
      activeDurationSeconds: episode.activeTaskDurationSeconds,
      coverageRatio,
      metrics,
      epistemicCaveats,
    }
  );
}
