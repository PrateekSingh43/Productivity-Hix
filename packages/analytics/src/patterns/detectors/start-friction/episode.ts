import type { EpisodeExecutionStatus, EpisodeMeasurementOutput } from "@repo/types";
import type { EpisodeExecutionContext } from "../../base/context";
import { createEpisodeResult } from "../../base/detector";
import type { TaskScheduleInstance } from "../schedule-variance/types";
import { hasIntegrityViolation } from "../schedule-variance/sequence";
import { calculateStartLatency, resolveFirstWorkStart } from "./sequence";
import type { StartFrictionConfig, StartFrictionEpisodeMetrics } from "./types";

/**
 * Evaluates one planned task instance for start-friction (Tier 1 episode).
 *
 * Purpose: measure first-work latency for a single planned task: authoritative
 * plannedStart versus earliest recorded work onset.
 *
 * Units: seconds for latency. Assumes plannedStart is authoritative (never
 * inferred) and sessions are the linked execution evidence.
 *
 * Edge cases: missing plannedStart or missing onset reports
 * INSUFFICIENT_EVIDENCE with an explicit caveat (never invented); corrupt
 * timestamps report INDETERMINATE_COVERAGE. Session onset is an
 * uncorroborated declaration (ONSET_UNCORROBORATED), mirroring D4.
 */
export function evaluateStartFrictionEpisode(
  context: EpisodeExecutionContext,
  evaluationId: string,
  taskInstance: TaskScheduleInstance,
  config: StartFrictionConfig,
): EpisodeMeasurementOutput<StartFrictionEpisodeMetrics> {
  const actualStart = resolveFirstWorkStart(taskInstance);

  if (!actualStart && hasIntegrityViolation(taskInstance.sessions)) {
    const metrics = calculateStartLatency(
      taskInstance.taskId,
      taskInstance.plannedStart,
      null,
      config.onTimeToleranceSeconds,
      taskInstance.plannedCapturedAt ?? null,
    );
    return createEpisodeResult<StartFrictionEpisodeMetrics>(
      context,
      evaluationId,
      "INDETERMINATE_COVERAGE",
      {
        taxonomy: "execution_friction",
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
        metrics: { ...metrics, status: "INTEGRITY_ERROR", actualStart: null },
        epistemicCaveats: ["INTEGRITY_ERROR_CORRUPT_TIMESTAMPS"],
      },
    );
  }

  const metrics = calculateStartLatency(
    taskInstance.taskId,
    taskInstance.plannedStart,
    actualStart,
    config.onTimeToleranceSeconds,
    taskInstance.plannedCapturedAt ?? null,
  );

  let executionStatus: EpisodeExecutionStatus = "NOT_QUALIFIED";
  const caveats: string[] = ["ONSET_UNCORROBORATED"];
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
    case "OBSERVED":
      executionStatus = "QUALIFIED";
      break;
  }

  const windowStart = taskInstance.plannedStart || context.timeline.windowStart;
  const windowEnd = actualStart || context.timeline.windowEnd;
  return createEpisodeResult<StartFrictionEpisodeMetrics>(
    context,
    evaluationId,
    executionStatus,
    {
      taxonomy: "execution_friction",
      temporalWindow: { start: windowStart, end: windowEnd, scale: "TASK_INSTANCE" },
      episodeEvidence: {
        sessionId: context.canonicalSessionId,
        taskId: taskInstance.taskId,
        boundingWindow: { start: windowStart, end: windowEnd },
      },
      activeDurationSeconds: 0,
      coverageRatio: metrics.status === "OBSERVED" ? 1.0 : 0.0,
      metrics,
      epistemicCaveats: caveats,
    },
  );
}
