import type { EpisodeMeasurementOutput } from "@repo/types";

/**
 * Configuration for Detector 2: Task Execution Fragmentation.
 * All thresholds are provisional and subject to calibration.
 */
export interface TaskFragmentationConfig {
  /**
   * Threshold for continuing the same task execution episode.
   * Gaps between task fragments exceeding this threshold close the episode.
   * Candidate: 7200 seconds (2 hours).
   */
  continuationGapThresholdSeconds: number;

  /**
   * Maximum fraction of unmonitored (UNKNOWN) time within the bounded episode
   * before the episode emits INDETERMINATE_COVERAGE.
   * Candidate: 0.20 (20%).
   */
  maxUnknownFraction: number;

  /**
   * Minimum active task execution duration required for an episode to qualify.
   * Episodes below this threshold emit INSUFFICIENT_EVIDENCE.
   * Candidate: 600 seconds (10 minutes).
   */
  minimumEpisodeActiveDurationSeconds: number;

  /**
   * Minimum qualifying episodes in current window for pattern evaluation.
   * Candidate: 3 episodes.
   */
  minimumQualifyingEpisodes: number;

  /**
   * Minimum distinct calendar days in current window for pattern evaluation.
   * Candidate: 2 distinct days.
   */
  minimumQualifyingCalendarDays: number;

  /**
   * Minimum baseline historical window duration in days.
   * Candidate: 14 days.
   */
  minimumBaselineDays: number;

  /**
   * Minimum baseline historical episodes required for maturity.
   * Candidate: 5 episodes.
   */
  minimumBaselineEpisodes: number;

  /**
   * Contrast threshold for deltaFragmentation (current - baseline).
   * Candidate: +0.30.
   */
  fragmentationContrastThreshold: number;

  /**
   * Recurrence threshold: fraction of qualifying episodes elevated above baseline.
   * Candidate: 0.60 (60%).
   */
  fragmentationRecurrenceThreshold: number;

  /**
   * Minimum mean telemetry coverage ratio across evaluation window.
   * Candidate: 0.80.
   */
  minimumPatternCoverageRatio: number;
}

/**
 * Breakdown of known intervening gaps within the bounded task episode.
 * Mutually exclusive, collectively exhaustive for known gaps.
 */
export interface TaskExecutionGapBreakdown {
  breakSeconds: number;
  otherTaskSeconds: number;
  unattributedObservedSeconds: number;
  explainedGapSeconds: number;
}

/**
 * Tier 1: Episode Measurement Metrics for Task Execution Fragmentation.
 */
export interface TaskExecutionFragmentationMetrics {
  /**
   * Authoritative task ID being measured.
   */
  taskId: string;

  /**
   * Number of distinct contiguous execution fragments for this task in the episode.
   */
  fragmentCount: number;

  /**
   * Total wall-clock span: lastFragment.endTime - firstFragment.startTime in seconds.
   */
  wallClockSpanSeconds: number;

  /**
   * Cumulative active execution duration on this task (sum of fragment durations) in seconds.
   */
  activeTaskDurationSeconds: number;

  /**
   * Cumulative known intervening non-task duration in seconds.
   */
  knownInterveningGapSeconds: number;

  /**
   * Cumulative unmonitored / missing telemetry duration inside the bounded episode in seconds.
   */
  unknownSeconds: number;

  /**
   * Fraction of wall-clock span that is unmonitored: unknownSeconds / wallClockSpanSeconds.
   */
  unknownFraction: number;

  /**
   * Primary fragmentation metric: knownInterveningGapSeconds / wallClockSpanSeconds in [0, 1].
   * Null if indeterminate or 0 if wallClockSpanSeconds <= 0.
   */
  wallClockFragmentationRatio: number | null;

  /**
   * Median duration of execution fragments via Method-7.
   */
  medianFragmentDurationSeconds: number | null;

  /**
   * Longest execution fragment duration in seconds.
   */
  longestFragmentDurationSeconds: number | null;

  /**
   * Interquartile range of fragment durations via Method-7.
   */
  interquartileFragmentDurationSeconds: number | null;

  /**
   * Median duration of intervening non-task intervals in seconds (null if fragmentCount <= 1).
   */
  medianInterveningGapSeconds: number | null;

  /**
   * Categorical breakdown of known intervening gaps.
   */
  gapBreakdown: TaskExecutionGapBreakdown;
}

/**
 * A historical task execution episode for the baseline population provider.
 */
export interface TaskExecutionBaselineEpisode {
  episodeId: string;
  taskId: string;
  userId: string;
  startedAt: string;
  endedAt: string;
  wallClockSpanSeconds: number;
  activeTaskDurationSeconds: number;
  knownInterveningGapSeconds: number;
  unknownSeconds: number;
  unknownFraction: number;
  wallClockFragmentationRatio: number | null;
  fragmentCount: number;
  coverageRatio: number;
}

/**
 * Tier 2: Pattern Level Metrics for Task Execution Fragmentation.
 */
export interface TaskExecutionFragmentationPatternMetrics {
  /**
   * Median wall-clock fragmentation ratio across qualifying episodes in window.
   */
  currentMedianFragmentation: number | null;

  /**
   * Median active task duration per episode in seconds.
   */
  currentMedianActiveDurationSeconds: number | null;

  /**
   * Median fragment count per episode.
   */
  currentMedianFragmentCount: number | null;

  /**
   * Fraction of qualifying episodes whose fragmentation ratio exceeds baseline reference.
   */
  elevatedEpisodeFraction: number | null;

  /**
   * Calibrated contrast: currentMedianFragmentation - baselineMedianFragmentation.
   */
  deltaFragmentation: number | null;
}

/**
 * Provider interface for fetching evaluated current window task episodes.
 */
export interface CurrentTaskEpisodesProvider<TMetrics = TaskExecutionFragmentationMetrics> {
  fetchEpisodes(
    userId: string,
    window: { start: string; end: string }
  ): Promise<EpisodeMeasurementOutput<TMetrics>[]>;
}
