import type { PatternSufficiency } from "@repo/types";

export type StartDeltaStatus =
  | "OBSERVED"
  | "NOT_OBSERVED"
  | "INDETERMINATE_COVERAGE"
  | "NO_PLANNED_START";

export type StartClassification = "EARLY" | "ON_TIME" | "LATE";

/**
 * Configuration for Detector 4: Schedule Variance.
 * All numeric thresholds are candidate / provisional and configurable.
 */
export interface ScheduleVarianceConfig {
  /** Allowed tolerance in seconds for an execution to be classified as ON_TIME (e.g. 300s = 5m). */
  onTimeToleranceSeconds: number;

  /** Minimum qualifying task instances required for pattern detection (e.g. 5). */
  minimumQualifyingTaskInstances: number;

  /** Minimum distinct local calendar days required for pattern detection (e.g. 3). */
  minimumDistinctCalendarDays: number;

  /** Minimum pattern coverage ratio (e.g. 0.80). */
  minimumPatternCoverageRatio: number;

  /** Fraction threshold of delayed tasks to detect a recurring schedule delay pattern (e.g. 0.50). */
  delayedStartFractionThreshold: number;

  /** Assessment window around planned start in seconds to verify coverage (e.g. 900s = 15m). */
  startAssessmentWindowSeconds?: number;

  /** Maximum unknown fraction in start assessment interval before classifying as indeterminate (e.g. 0.50). */
  maxStartAssessmentUnknownFraction?: number;

  /** Minimum historical baseline tasks required for mature baseline contrast (if baseline comparison is used). */
  minimumBaselineTasks?: number;

  detectorVersion: string;
  configurationVersion: string;
  sufficiency?: PatternSufficiency;
}

/**
 * Authoritative task schedule instance representation.
 */
export interface TaskScheduleInstance {
  taskId: string;
  plannedStart: string | null;
  plannedDurationMinutes?: number | null;
  sessions: Array<{
    id: string;
    startedAt: string;
    endedAt?: string | null;
    durationSeconds?: number | null;
  }>;
}

/**
 * Tier 1: Episode Measurement Metrics for Schedule Variance.
 */
export interface ScheduleVarianceEpisodeMetrics {
  taskId: string;
  plannedStart: string | null;
  actualStart: string | null;
  /** Primary signed variance: actualStart - plannedStart in seconds (negative: early, 0: exact, positive: late). */
  startDeltaSeconds: number | null;
  /** Primary signed variance in minutes for human-readable convenience. */
  startDeltaMinutes: number | null;
  /** Strictly null! Relative deltaRatio is prohibited on signed start variance. */
  deltaRatio: null;
  classification: StartClassification | null;
  status: StartDeltaStatus;
  scheduleDeviationRatio?: number | null;
}

/**
 * Tier 2: Pattern Level Metrics for Schedule Variance across multiple tasks.
 */
export interface ScheduleVariancePatternMetrics {
  medianStartDeltaSeconds: number | null;
  iqrStartDeltaSeconds: number | null;
  meanStartDeltaSeconds: number | null;
  lateTaskFraction: number | null;
  earlyTaskFraction: number | null;
  onTimeTaskFraction: number | null;
  punctualStartTaskCount: number;
  delayedStartTaskCount: number;
  notObservedTaskCount: number;
  indeterminateStartTaskCount: number;
  unplannedTaskCount: number;
  totalTaskCount: number;
  observedStartTaskCount: number;
}

/**
 * Provider interface for fetching task schedule instances in an evaluation window.
 */
export interface CurrentTaskSchedulesProvider {
  fetchTaskScheduleInstances(
    userId: string,
    window: { start: string; end: string }
  ): Promise<TaskScheduleInstance[]>;
}
