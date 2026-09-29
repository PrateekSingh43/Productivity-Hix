import type { EpisodeExecutionStatus, EpisodeMeasurementOutput } from "@repo/types";
import type { EpisodeExecutionContext } from "../../base/context";
import { createEpisodeResult } from "../../base/detector";
import { findEscapeAfter, findFrictionTrigger } from "./sequence";
import type { EscapeHatchConfig, EscapeHatchEpisodeInput, EscapeHatchEpisodeMetrics } from "./types";

/**
 * Evaluates one task onset for escape-hatch co-occurrence (Tier 1 episode).
 *
 * Purpose: decide whether a friction event occurred shortly after recorded
 * work on a task began, and whether escape-context activity followed within
 * minutes. Emits co-occurrence evidence only; the copy layer must never
 * phrase the result causally.
 *
 * Units: seconds. Assumes session.startedAt marks the recorded task onset
 * and blocks carry UTC ISO bounds.
 *
 * Edge cases: an invalid session start reports INSUFFICIENT_EVIDENCE
 * (NO_SESSION_EVIDENCE). A start with no observed friction reports
 * INSUFFICIENT_EVIDENCE (NO_FRICTION_OBSERVED) — the escape share divides by
 * friction occasions only, so non-friction starts are excluded rather than
 * counted as negatives. Coverage accounting spans the assessment window
 * [taskStart, taskStart + lookback); OBSERVED/OBSERVED_REPORTED overlap
 * counts as observed, UNKNOWN overlap as unknown, all else as neither.
 */
export function evaluateEscapeHatchEpisode(
  context: EpisodeExecutionContext,
  evaluationId: string,
  input: EscapeHatchEpisodeInput,
  config: EscapeHatchConfig,
): EpisodeMeasurementOutput<EscapeHatchEpisodeMetrics> {
  const taskStartMs = Date.parse(input.session.startedAt);
  const baseMetrics = {
    taskId: input.taskId,
    sessionId: input.session.id,
    taskStart: input.session.startedAt,
    frictionAt: null as string | null,
    frictionEnd: null as string | null,
    frictionKind: null as EscapeHatchEpisodeMetrics["frictionKind"],
    escapeAt: null as string | null,
    escapeKey: null as string | null,
    escaped: false,
    assessmentSpanSeconds: config.frictionLookbackSeconds,
    assessmentObservedSeconds: 0,
    assessmentUnknownSeconds: 0,
    status: "NO_SESSION_EVIDENCE" as const,
  };
  const windowEndMs = taskStartMs + config.frictionLookbackSeconds * 1000;
  const assess = (status: EpisodeExecutionStatus, caveats: string[]) => {
    const observed = input.blocks.reduce((sum, block) => {
      if (block.coverage !== "OBSERVED" && block.coverage !== "OBSERVED_REPORTED") return sum;
      const overlapMs =
        Math.min(Date.parse(block.endTime), windowEndMs) - Math.max(Date.parse(block.startTime), taskStartMs);
      return sum + (overlapMs > 0 ? overlapMs / 1000 : 0);
    }, 0);
    const unknown = input.blocks.reduce((sum, block) => {
      if (block.coverage !== "UNKNOWN") return sum;
      const overlapMs =
        Math.min(Date.parse(block.endTime), windowEndMs) - Math.max(Date.parse(block.startTime), taskStartMs);
      return sum + (overlapMs > 0 ? overlapMs / 1000 : 0);
    }, 0);
    return createEpisodeResult<EscapeHatchEpisodeMetrics>(
      context,
      evaluationId,
      status,
      {
        taxonomy: "execution_friction",
        temporalWindow: {
          start: input.session.startedAt,
          end: new Date(windowEndMs).toISOString(),
          scale: "INTRA_SESSION",
        },
        episodeEvidence: {
          sessionId: input.session.id,
          taskId: input.taskId,
          boundingWindow: {
            start: input.session.startedAt,
            end: new Date(windowEndMs).toISOString(),
          },
        },
        activeDurationSeconds:
          typeof input.session.durationSeconds === "number" && input.session.durationSeconds > 0
            ? input.session.durationSeconds
            : 0,
        coverageRatio: config.frictionLookbackSeconds > 0 ? observed / config.frictionLookbackSeconds : 0,
        metrics: {
          ...baseMetrics,
          assessmentObservedSeconds: observed,
          assessmentUnknownSeconds: unknown,
        },
        epistemicCaveats: caveats,
      },
    );
  };

  if (!Number.isFinite(taskStartMs)) {
    return assess("INSUFFICIENT_EVIDENCE", ["NO_SESSION_EVIDENCE"]);
  }
  const trigger = findFrictionTrigger(
    input.blocks,
    input.session.startedAt,
    config.frictionLookbackSeconds,
    config.frictionGapThresholdSeconds,
  );
  if (!trigger) {
    return assess("INSUFFICIENT_EVIDENCE", ["NO_FRICTION_OBSERVED_NEAR_TASK_START"]);
  }
  const escape = findEscapeAfter(input.blocks, trigger.end, config.escapeAfterSeconds);
  const qualified = assess("QUALIFIED", ["CO_OCCURRENCE_ONLY"]);
  qualified.metrics = {
    ...qualified.metrics,
    frictionAt: trigger.at,
    frictionEnd: trigger.end,
    frictionKind: trigger.kind,
    escapeAt: escape?.at ?? null,
    escapeKey: escape?.key ?? null,
    escaped: escape !== null,
    status: "FRICTION_OBSERVED",
  };
  return qualified;
}
