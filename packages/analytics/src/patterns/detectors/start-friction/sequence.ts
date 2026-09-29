import { isValidTimestamp, resolveActualStart } from "../schedule-variance/sequence";
import type { TaskScheduleInstance } from "../schedule-variance/types";
import type {
  StartFrictionClassification,
  StartFrictionEpisodeMetrics,
} from "./types";

/**
 * Start-friction sequence helpers (pure/deterministic).
 *
 * Purpose: resolve first-work onset per task and compute the signed latency
 * against the authoritative planned start. Onset resolution reuses the
 * schedule-variance canonical sort/dedupe so D6 and D4 agree on "first work".
 *
 * Units: seconds for latencies. Assumes plannedStart is authoritative (never
 * inferred); actualStart is the earliest valid linked session start.
 *
 * Edge cases: null plannedStart yields NO_PLANNED_START; malformed planned
 * or actual timestamps yield INTEGRITY_ERROR (corrupt record, not missing
 * data); no sessions yields NOT_OBSERVED. Classification boundary mirrors
 * schedule-variance: latency < -tolerance is EARLY, |latency| <= tolerance is
 * ON_TIME, latency > tolerance is LATE.
 */

export function calculateStartLatency(
  taskId: string,
  plannedStartStr: string | null,
  actualStartStr: string | null,
  onTimeToleranceSeconds: number,
  plannedCapturedAt?: string | null,
): StartFrictionEpisodeMetrics {
  if (!plannedStartStr) {
    return {
      taskId,
      plannedStart: null,
      plannedCapturedAt: plannedCapturedAt ?? null,
      actualStart: actualStartStr,
      latencySeconds: null,
      latencyMinutes: null,
      deltaRatio: null,
      classification: null,
      status: "NO_PLANNED_START",
    };
  }
  if (!isValidTimestamp(plannedStartStr)) {
    return {
      taskId,
      plannedStart: plannedStartStr,
      plannedCapturedAt: plannedCapturedAt ?? null,
      actualStart: actualStartStr,
      latencySeconds: null,
      latencyMinutes: null,
      deltaRatio: null,
      classification: null,
      status: "INTEGRITY_ERROR",
    };
  }
  if (!actualStartStr) {
    return {
      taskId,
      plannedStart: plannedStartStr,
      plannedCapturedAt: plannedCapturedAt ?? null,
      actualStart: null,
      latencySeconds: null,
      latencyMinutes: null,
      deltaRatio: null,
      classification: null,
      status: "NOT_OBSERVED",
    };
  }
  if (!isValidTimestamp(actualStartStr)) {
    return {
      taskId,
      plannedStart: plannedStartStr,
      plannedCapturedAt: plannedCapturedAt ?? null,
      actualStart: actualStartStr,
      latencySeconds: null,
      latencyMinutes: null,
      deltaRatio: null,
      classification: null,
      status: "INTEGRITY_ERROR",
    };
  }

  const latencySeconds = (Date.parse(actualStartStr) - Date.parse(plannedStartStr)) / 1000;
  let classification: StartFrictionClassification;
  if (latencySeconds < -onTimeToleranceSeconds) {
    classification = "EARLY";
  } else if (Math.abs(latencySeconds) <= onTimeToleranceSeconds) {
    classification = "ON_TIME";
  } else {
    classification = "LATE";
  }
  return {
    taskId,
    plannedStart: plannedStartStr,
    plannedCapturedAt: plannedCapturedAt ?? null,
    actualStart: actualStartStr,
    latencySeconds,
    latencyMinutes: latencySeconds / 60,
    deltaRatio: null,
    classification,
    status: "OBSERVED",
  };
}

/** Resolves the earliest valid session onset for a task instance, if any. */
export function resolveFirstWorkStart(instance: TaskScheduleInstance): string | null {
  return resolveActualStart(instance.sessions)?.actualStart ?? null;
}
