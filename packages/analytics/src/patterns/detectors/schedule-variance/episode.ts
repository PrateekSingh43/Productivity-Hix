import type {
  EpisodeMeasurementOutput,
  EpisodeExecutionStatus,
} from "@repo/types";
import type { EpisodeExecutionContext } from "../../base/context";
import { createEpisodeResult } from "../../base/detector";
import type {
  ScheduleVarianceConfig,
  ScheduleVarianceEpisodeMetrics,
  TaskScheduleInstance,
} from "./types";
import { resolveActualStart, calculateScheduleVariance, hasIntegrityViolation } from "./sequence";

/**
 * Evaluates a single task schedule instance for Detector 4 (Tier 1 Episode).
 * 
 * Strict invariants:
 * - plannedStart must be authoritative (never inferred from createdAt, dueAt, or check-in).
 * - actualStart comes strictly from first valid execution session.
 * - deltaRatio is strictly null.
 * - Missing plannedStart or execution results in explicit INSUFFICIENT_EVIDENCE with caveats.
 */
export function evaluateScheduleVarianceEpisode(
  context: EpisodeExecutionContext,
  evaluationId: string,
  taskInstance: TaskScheduleInstance,
  config: ScheduleVarianceConfig
): EpisodeMeasurementOutput<ScheduleVarianceEpisodeMetrics> {
  const resolved = resolveActualStart(taskInstance.sessions);
  const actualStart = resolved?.actualStart ?? null;

  if (!actualStart && hasIntegrityViolation(taskInstance.sessions)) {
    const metrics = calculateScheduleVariance(
      taskInstance.taskId,
      taskInstance.plannedStart,
      null,
      config.onTimeToleranceSeconds,
      taskInstance.plannedDurationMinutes,
      null,
      taskInstance.plannedCapturedAt
    );
    return createEpisodeResult<ScheduleVarianceEpisodeMetrics>(
      context,
      evaluationId,
      "INDETERMINATE_COVERAGE",
      {
        taxonomy: "schedule_fidelity",
        temporalWindow: {
          start: taskInstance.plannedStart || context.timeline.windowStart,
          end: context.timeline.windowEnd,
          scale: "TASK_INSTANCE",
        },
        episodeEvidence: {
          sessionId: context.canonicalSessionId,
          taskId: taskInstance.taskId,
          boundingWindow: {
            start: taskInstance.plannedStart || context.timeline.windowStart,
            end: context.timeline.windowEnd,
          },
        },
        activeDurationSeconds: 0,
        coverageRatio: 0,
        metrics: {
          ...metrics,
          status: "INTEGRITY_ERROR",
          actualStart: null,
        },
        epistemicCaveats: ["INTEGRITY_ERROR_CORRUPT_TIMESTAMPS"],
      }
    );
  }

  const metrics = calculateScheduleVariance(
    taskInstance.taskId,
    taskInstance.plannedStart,
    actualStart,
    config.onTimeToleranceSeconds,
    taskInstance.plannedDurationMinutes,
    null,
    taskInstance.plannedCapturedAt
  );

  let executionStatus: EpisodeExecutionStatus = "NOT_QUALIFIED";
  const caveats: string[] = [];

  if (!taskInstance.corroboration) {
    caveats.push("ONSET_UNCORROBORATED");
  }

  switch (metrics.status) {
    case "NO_PLANNED_START":
      executionStatus = "INSUFFICIENT_EVIDENCE";
      caveats.push("NO_AUTHORITATIVE_PLANNED_START");
      break;
    case "NOT_OBSERVED":
      executionStatus = "INSUFFICIENT_EVIDENCE";
      caveats.push("NO_ACTUAL_EXECUTION_OBSERVED");
      break;
    case "INTEGRITY_ERROR":
      executionStatus = "INDETERMINATE_COVERAGE";
      caveats.push("INTEGRITY_ERROR_CORRUPT_TIMESTAMPS");
      break;
    case "INDETERMINATE_COVERAGE":
      executionStatus = "INDETERMINATE_COVERAGE";
      caveats.push("INVALID_TIMESTAMPS_OR_UNMONITORED_START");
      break;
    case "OBSERVED":
      executionStatus = "QUALIFIED";
      break;
  }

  const windowStart = taskInstance.plannedStart || context.timeline.windowStart;
  const windowEnd = actualStart || context.timeline.windowEnd;

  return createEpisodeResult<ScheduleVarianceEpisodeMetrics>(
    context,
    evaluationId,
    executionStatus,
    {
      taxonomy: "schedule_fidelity",
      temporalWindow: {
        start: windowStart,
        end: windowEnd,
        scale: "TASK_INSTANCE",
      },
      episodeEvidence: {
        sessionId: resolved?.sessionId || context.canonicalSessionId,
        taskId: taskInstance.taskId,
        boundingWindow: {
          start: windowStart,
          end: windowEnd,
        },
      },
      activeDurationSeconds: 0,
      coverageRatio: metrics.status === "OBSERVED" ? 1.0 : 0.0,
      metrics,
      epistemicCaveats: caveats,
    }
  );
}
