import type { PatternSufficiency } from "@repo/types";

/**
 * Start-friction detector (D6) shared types.
 *
 * Purpose: answer "how long between deciding to start and actually starting?"
 * by comparing each task's authoritative plannedStart (declared intention)
 * against its first recorded work onset (earliest linked session start).
 * Produces first-work latency recurrence (median lateness + directional share).
 *
 * Units: seconds for latencies. Assumes plannedStart is authoritative plan
 * data passed through verbatim (never inferred from session times) and
 * actualStart is the earliest valid linked session start.
 *
 * Edge cases: a null plannedStart stays null (NO_PLANNED_START, never
 * invented); malformed timestamps report INTEGRITY_ERROR, distinct from
 * NOT_OBSERVED (no execution at all). Relative deltaRatio is prohibited on
 * signed latency, mirroring schedule-variance.
 */

export type StartFrictionStatus =
  | "OBSERVED"
  | "NOT_OBSERVED"
  | "NO_PLANNED_START"
  | "INTEGRITY_ERROR";

export type StartFrictionClassification = "EARLY" | "ON_TIME" | "LATE";

export interface StartFrictionConfig {
  /** Allowed tolerance in seconds for an onset to count as ON_TIME. */
  onTimeToleranceSeconds: number;
  /** Minimum qualifying (observed) task instances (mirrors D1: 5). */
  minimumQualifyingTaskInstances: number;
  /** Minimum distinct local calendar days (mirrors D1: 3). */
  minimumDistinctCalendarDays: number;
  minimumPatternCoverageRatio: number;
  /** Minimum share of observed onsets classified LATE (2/3). */
  frictionShareThreshold: number;
  detectorVersion: string;
  configurationVersion: string;
  sufficiency?: PatternSufficiency;
}

/** Tier 1: episode measurement for one planned task instance. */
export interface StartFrictionEpisodeMetrics {
  taskId: string;
  plannedStart: string | null;
  /** As-of marker of the plan value used, when the source exposes it. */
  plannedCapturedAt?: string | null;
  actualStart: string | null;
  /** Signed latency: actualStart - plannedStart in seconds (negative: early). */
  latencySeconds: number | null;
  latencyMinutes: number | null;
  /** Strictly null! Relative deltaRatio is prohibited on signed latency. */
  deltaRatio: null;
  classification: StartFrictionClassification | null;
  status: StartFrictionStatus;
}

/** Tier 2: pattern metrics across a population of planned tasks. */
export interface StartFrictionPatternMetrics {
  medianLatencySeconds: number | null;
  iqrLatencySeconds: number | null;
  meanLatencySeconds: number | null;
  frictionShare: number | null;
  frictionTaskCount: number;
  punctualTaskCount: number;
  notObservedTaskCount: number;
  unplannedTaskCount: number;
  totalTaskCount: number;
  observedTaskCount: number;
}
