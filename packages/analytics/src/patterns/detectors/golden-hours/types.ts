import type { CheckIn, TemporalEvidenceBlock } from "@repo/types";

/**
 * Golden-hours focus detector (D5) shared types.
 *
 * Purpose: answer "when am I actually sharp?" by comparing, per local day,
 * recorded switching in a fixed morning window (09:30-11:30) against a fixed
 * afternoon window (15:00-18:00) in the detector's local timezone
 * (`input.timezone`). Units: switches/hour for telemetry, ordinal 1-3 scores
 * for self-reported focus (see FOCUS_SCORE).
 *
 * Assumptions: evidence blocks carry UTC ISO bounds; check-ins attribute to a
 * window by overlapping [windowStart, windowEnd] when present, else by
 * createdAt falling inside the window. Days are local calendar days.
 *
 * Edge cases: windows may straddle DST transitions (local-to-UTC resolution
 * converges to the nearest valid instant; documented in sequence.ts). Unknown
 * or unmapped focus strings are ignored, never invented. A day qualifies only
 * when BOTH windows meet the minimum observed-seconds floor.
 */

export const GOLDEN_HOURS_AM_START_MINUTES = 9 * 60 + 30;
export const GOLDEN_HOURS_AM_END_MINUTES = 11 * 60 + 30;
export const GOLDEN_HOURS_PM_START_MINUTES = 15 * 60;
export const GOLDEN_HOURS_PM_END_MINUTES = 18 * 60;

/** Catalog context key for this detector (verbatim product copy). */
export const GOLDEN_HOURS_CONTEXT_KEY = "09:30-11:30 vs 15:00-18:00";

export interface GoldenHoursConfig {
  amStartMinutes: number;
  amEndMinutes: number;
  pmStartMinutes: number;
  pmEndMinutes: number;
  /** Minimum qualifying observed seconds per window for a day to count. */
  minimumWindowObservedSeconds: number;
  /** Minimum qualifying day-episodes in the current window (mirrors D1: 5). */
  minimumQualifyingDayEpisodes: number;
  /** Minimum distinct local days in the current window (mirrors D1: 3). */
  minimumQualifyingCalendarDays: number;
  /** Minimum qualifying day-episodes in the baseline window (mirrors D1: 5). */
  minimumBaselineDayEpisodes: number;
  /** Minimum distinct local days in the baseline window (mirrors D1: 3). */
  minimumBaselineDays: number;
  /** Minimum |signed relative AM-vs-PM change| (mirrors D1: 0.5). */
  contrastThreshold: number;
  /** Minimum share of qualifying days favouring calmer mornings (2/3). */
  directionalShareThreshold: number;
  minimumPatternCoverageRatio: number;
  maximumUnknownFraction: number;
}

/**
 * Ordinal mapping for categorical self-reported focus. CheckIn.focus is a
 * category string ("scattered" | "mixed" | "focused"), not a numeric rating,
 * so means are computed over this explicit 1-3 scale. Values outside the map
 * (null, "", or future categories) map to null and are excluded from means;
 * they are never scored or invented.
 */
export const FOCUS_SCORE: Record<string, number> = {
  scattered: 1,
  mixed: 2,
  focused: 3,
};

export function focusScoreFor(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const score = FOCUS_SCORE[value.trim().toLowerCase()];
  return typeof score === "number" ? score : null;
}

export interface GoldenHoursWindowSummary {
  switchesPerHour: number | null;
  meanFocusScore: number | null;
  observedSeconds: number;
  unknownSeconds: number;
  switchCount: number;
  focusRatingCount: number;
  blockIds: string[];
}

export interface GoldenHoursDayEpisode {
  /** Local calendar date (YYYY-MM-DD) in the detector timezone. */
  date: string;
  amWindow: { start: string; end: string };
  pmWindow: { start: string; end: string };
  am: GoldenHoursWindowSummary;
  pm: GoldenHoursWindowSummary;
  /** (amObserved + pmObserved) / (amSpan + pmSpan). */
  coverageRatio: number;
  /** (amUnknown + pmUnknown) / (amSpan + pmSpan). */
  unknownFraction: number;
  windowSpanSeconds: number;
  observedSeconds: number;
  executionStatus: "QUALIFIED" | "INSUFFICIENT_EVIDENCE";
  /**
   * True when AM switches/hr is strictly below PM switches/hr and any present
   * focus means agree (AM mean >= PM mean). Days with focus in only one
   * window (or none) fall back to the switches/hr contrast alone.
   */
  supportsAmCalmer: boolean;
  sessionIds: string[];
  reportIds: string[];
}

export interface GoldenHoursDayEpisodeInput {
  blocks: TemporalEvidenceBlock[];
  sessions: Array<{ id: string; taskId: string | null; startedAt: string; endedAt: string | null }>;
  reports: CheckIn[];
  window: { start: string; end: string };
  timezone: string;
}

export interface GoldenHoursPatternMetrics {
  amMedianSwitchesPerHour: number | null;
  pmMedianSwitchesPerHour: number | null;
  /**
   * signedRelativeChange(amMedian, pmMedian). Negative when recorded mornings
   * are calmer than afternoons; null when either median is missing.
   */
  contrast: number | null;
  supportingDays: number;
  amMedianFocusScore: number | null;
  pmMedianFocusScore: number | null;
  /** Qualifying days with a focus mean in BOTH windows. */
  focusDays: number;
}
