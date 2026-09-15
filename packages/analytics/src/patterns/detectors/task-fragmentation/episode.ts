import type { EpisodeExecutionContext } from "../../base/context";
import { createEpisodeResult } from "../../base/detector";
import type { EpisodeMeasurementOutput, EpisodeExecutionStatus, TemporalEvidenceBlock } from "@repo/types";
import type { TaskFragmentationConfig, TaskExecutionFragmentationMetrics } from "./types";
import { segmentTaskExecutionEpisodes, findAuthoritativeTaskIds } from "./sequence";

function createEmptyMetrics(taskId: string): TaskExecutionFragmentationMetrics {
  return {
    taskId,
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
}

/**
 * Evaluates a single bounded task execution episode.
 * 
 * Rules:
 * - A D2 EpisodeExecutionContext must identify one authoritative target task.
 * - If multiple authoritative tasks exist and no explicit targetTaskId is supplied,
 *   returns an explicit INSUFFICIENT_EVIDENCE result without guessing or arbitrary selection.
 * - A session ID is NEVER interpreted as a task ID.
 * - An EpisodeExecutionContext maps to exactly one bounded task execution episode.
 * - Multiple bounded episodes within the window are rejected rather than silently using episodes[0].
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

  // Determine authoritative target taskId from explicit parameter or context
  let resolvedTaskId = targetTaskId ?? context.targetTaskId;

  if (!resolvedTaskId) {
    const authoritativeIds = findAuthoritativeTaskIds(blocks);

    if (authoritativeIds.length === 0) {
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
          metrics: createEmptyMetrics("unknown"),
          epistemicCaveats: ["No authoritative explicit task linkage found in episode window."],
        }
      );
    }

    if (authoritativeIds.length > 1) {
      // Reject ambiguous multi-task context without guessing or picking arbitrarily
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
          metrics: createEmptyMetrics("ambiguous"),
          epistemicCaveats: [
            `Ambiguous task context: Multiple authoritative tasks detected in window (${authoritativeIds.join(
              ", "
            )}) with no explicit targetTaskId provided.`,
          ],
        }
      );
    }

    // Exactly one authoritative task ID present
    resolvedTaskId = authoritativeIds[0];
  }

  // Segment blocks into bounded task episodes
  const episodes = segmentTaskExecutionEpisodes(blocks, resolvedTaskId, {
    continuationGapThresholdSeconds: config.continuationGapThresholdSeconds,
    timezone: context.timezone,
    maxUnknownFraction: config.maxUnknownFraction,
  });

  if (episodes.length === 0) {
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
        metrics: createEmptyMetrics(resolvedTaskId),
        epistemicCaveats: ["No active task execution fragments observed for task."],
      }
    );
  }

  // D2 Fix 2: Exactly one bounded task execution episode per EpisodeExecutionContext.
  // Multiple bounded episodes must not be silently discarded or truncated to episodes[0].
  if (episodes.length > 1) {
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
        metrics: createEmptyMetrics(resolvedTaskId),
        epistemicCaveats: [
          `Multiple bounded task execution episodes detected within a single EpisodeExecutionContext window (${episodes.length} episodes). An EpisodeExecutionContext must encompass exactly one bounded episode.`,
        ],
      }
    );
  }

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
