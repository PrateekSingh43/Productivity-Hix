import type { PatternSufficiency } from "@repo/types";

/**
 * Configuration for Detector 3: Extended Continuous Observed Activity.
 * All thresholds are candidate / provisional and configurable.
 */
export interface ContinuousActivityConfig {
  /** Minimum unbroken continuous duration in seconds for an episode to qualify (e.g. 2700s = 45m). */
  minimumEpisodeDurationSeconds: number;

  /** Allowed gap in seconds between observations before continuity is considered broken (e.g. 5s or 0s). */
  maximumContinuityGapSeconds: number;

  /** Minimum observed coverage ratio within the evaluated window (e.g. 0.80). */
  minimumCoverageRatio: number;

  /** Maximum fraction of UNKNOWN time within the candidate run (e.g. 0.05). */
  maxUnknownFraction: number;

  /** Minimum baseline lookback window days (if baseline enrichment is evaluated, e.g. 30). */
  minimumBaselineDays?: number;

  /** Minimum baseline episodes for mature percentile evaluation (e.g. 5). */
  minimumBaselineEpisodes?: number;

  /** Historical percentile threshold for qualification enrichment (e.g. 90). */
  percentileThreshold?: number;

  detectorVersion: string;
  configurationVersion: string;
  sufficiency?: PatternSufficiency;
}

export interface ContinuousActivityMetrics {
  evaluationWindowSeconds: number;
  blockIds: string[];
  unknownFraction: number;
  runCount: number;
  /** Total continuous duration of observed activity in seconds (primary metric). */
  continuousDurationSeconds: number;

  /** Actual observed activity duration in seconds inside the continuous interval (without small gap tolerance). */
  observedDurationSeconds: number;

  /** Count of non-continuous interruptions observed within the evaluation window. */
  interruptionCount: number;

  /** Duration in seconds of the longest continuous observed activity run found. */
  longestObservedRunSeconds: number;

  /** Ratio of observed active time to total wall-clock span. */
  coverageRatio: number;

  /** Optional context concentration ratio (proportion of active time in the single dominant application/context). */
  contextConcentrationRatio?: number | null;
}

export interface ContinuousActivityRun {
  startTime: string;
  endTime: string;
  continuousDurationSeconds: number;
  observedDurationSeconds: number;
  blockIds: string[];
  interruptionCount: number;
  isOpenInterval?: boolean;
}
