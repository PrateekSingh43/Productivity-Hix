import type { PatternSufficiency, WorkSession } from "@repo/types";

/**
 * Planned-vs-actual detector (D8) shared types.
 *
 * Purpose: answer "how do my actual task durations compare with what I
 * planned?" by comparing each completed task's plannedDurationMinutes
 * (declared intention, Task 1 plumbing) against summed recorded session
 * durations. Produces the median bias ratio after enough completions.
 *
 * Units: minutes for durations; biasRatio is actual / planned (unitless,
 * e.g. 1.57 means actuals ran 57% longer than planned).
 *
 * Edge cases: uncompleted tasks (completedAt null), missing/non-positive
 * plans, and tasks with no recorded session time are excluded with explicit
 * statuses — never guessed, never zero-filled. A plan of zero or less can
 * never divide; those tasks report NO_PLAN.
 */

export type PlannedActualStatus = "OBSERVED" | "NOT_COMPLETED" | "NO_PLAN" | "NOT_OBSERVED";

export interface PlannedActualConfig {
  /** Minimum qualifying completed tasks (5). */
  minimumQualifyingCompletedTasks: number;
  /** Minimum distinct local calendar days (mirrors D1: 3). */
  minimumDistinctCalendarDays: number;
  /** Median bias ratio at or above which actuals count as overrunning (1.2). */
  overrunRatioThreshold: number;
  /** Minimum share of qualifying tasks at or above the overrun ratio (2/3). */
  overrunShareThreshold: number;
  minimumPatternCoverageRatio: number;
  maximumUnknownFraction: number;
  detectorVersion: string;
  configurationVersion: string;
  sufficiency?: PatternSufficiency;
}

/** One completed task considered by the detector. */
export interface PlannedActualEpisodeInput {
  taskId: string;
  completedAt: string | null;
  plannedDurationMinutes: number | null;
  sessions: Pick<WorkSession, "id" | "startedAt" | "endedAt" | "durationSeconds">[];
}

/** Tier 1: episode measurement for one completed task. */
export interface PlannedActualEpisodeMetrics {
  taskId: string;
  completedAt: string | null;
  plannedDurationMinutes: number | null;
  actualDurationMinutes: number | null;
  /** actual / planned; null when either side is missing or the plan is <= 0. */
  biasRatio: number | null;
  /** True when biasRatio meets the configured overrun ratio. */
  supportsOverrun: boolean;
  status: PlannedActualStatus;
}

/** Tier 2: pattern metrics across qualifying completed tasks. */
export interface PlannedActualPatternMetrics {
  medianBiasRatio: number | null;
  meanBiasRatio: number | null;
  overrunShare: number | null;
  overrunTaskCount: number;
  qualifyingTaskCount: number;
  totalTaskCount: number;
}
