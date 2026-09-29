import type { EpisodeMeasurementOutput } from "@repo/types";
import type { EpisodeExecutionContext } from "../../base/context";
import { createEpisodeResult } from "../../base/detector";
import { actualMinutesFor, biasRatioFor } from "./sequence";
import type { PlannedActualConfig, PlannedActualEpisodeInput, PlannedActualEpisodeMetrics } from "./types";

/**
 * Evaluates one task for planned-vs-actual bias (Tier 1 episode).
 *
 * Purpose: measure the actual-vs-planned duration ratio for a single
 * completed task.
 *
 * Units: minutes; biasRatio is unitless.
 *
 * Edge cases: uncompleted tasks (completedAt null) report
 * INSUFFICIENT_EVIDENCE (NOT_COMPLETED) — only finished work can reveal
 * duration bias. Missing/non-positive plans report INSUFFICIENT_EVIDENCE
 * (NO_PLAN); tasks with no recorded session time report
 * INSUFFICIENT_EVIDENCE (NOT_OBSERVED). Only a task with a positive plan,
 * a completion marker, and positive recorded time is QUALIFIED.
 */
export function evaluatePlannedActualEpisode(
  context: EpisodeExecutionContext,
  evaluationId: string,
  input: PlannedActualEpisodeInput,
  config: PlannedActualConfig,
): EpisodeMeasurementOutput<PlannedActualEpisodeMetrics> {
  const actual = actualMinutesFor(input.sessions);
  const bias = biasRatioFor(input.plannedDurationMinutes, actual);

  let status: PlannedActualEpisodeMetrics["status"] = "OBSERVED";
  if (!input.completedAt || !Number.isFinite(Date.parse(input.completedAt))) {
    status = "NOT_COMPLETED";
  } else if (bias === null && !(typeof input.plannedDurationMinutes === "number" && input.plannedDurationMinutes > 0)) {
    status = "NO_PLAN";
  } else if (bias === null) {
    status = "NOT_OBSERVED";
  }

  const windowEnd = input.completedAt && Number.isFinite(Date.parse(input.completedAt))
    ? input.completedAt
    : context.timeline.windowEnd;
  const sessionStarts = input.sessions
    .map((session) => Date.parse(session.startedAt))
    .filter((ms) => Number.isFinite(ms));
  const windowStart =
    sessionStarts.length > 0
      ? new Date(Math.min(...sessionStarts)).toISOString()
      : context.timeline.windowStart;

  return createEpisodeResult<PlannedActualEpisodeMetrics>(
    context,
    evaluationId,
    status === "OBSERVED" ? "QUALIFIED" : "INSUFFICIENT_EVIDENCE",
    {
      taxonomy: "schedule_fidelity",
      temporalWindow: { start: windowStart, end: windowEnd, scale: "TASK_INSTANCE" },
      episodeEvidence: {
        sessionId: context.canonicalSessionId,
        taskId: input.taskId,
        boundingWindow: { start: windowStart, end: windowEnd },
      },
      activeDurationSeconds: actual !== null ? actual * 60 : 0,
      coverageRatio: status === "OBSERVED" ? 1.0 : 0.0,
      metrics: {
        taskId: input.taskId,
        completedAt: input.completedAt,
        plannedDurationMinutes: input.plannedDurationMinutes,
        actualDurationMinutes: actual,
        biasRatio: bias,
        supportsOverrun: bias !== null && bias >= config.overrunRatioThreshold,
        status,
      },
      epistemicCaveats:
        status === "OBSERVED"
          ? []
          : [status === "NOT_COMPLETED" ? "TASK_NOT_COMPLETED" : status === "NO_PLAN" ? "NO_PLANNED_DURATION" : "NO_RECORDED_SESSION_TIME"],
    },
  );
}
