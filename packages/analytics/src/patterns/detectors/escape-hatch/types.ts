import type { PatternSufficiency, TemporalEvidenceBlock, WorkSession } from "@repo/types";

/**
 * Escape-hatch detector (D7) shared types.
 *
 * Purpose: answer "after friction near a task start, does escape-context
 * activity often follow within minutes?" A friction event is a stall shortly
 * after recorded work on a task begins (an unobserved gap > 10 minutes
 * within 30 minutes of the task start, or an INDETERMINATE coverage block);
 * an escape is recorded activity on an explicit escape-context domain
 * (YouTube) within 5 minutes after the friction event. Output is a
 * co-occurrence finding only — never a causal claim.
 *
 * Units: seconds for durations. Assumes block bounds are valid UTC ISO
 * strings and session starts mark recorded task onsets.
 *
 * Edge cases: unknown or missing domains are excluded, never guessed. A
 * task start with no observed friction is INSUFFICIENT_EVIDENCE for this
 * detector (not a negative), so the escape share divides by friction
 * occasions only.
 */

export type EscapeFrictionKind = "GAP" | "INDETERMINATE";

export interface EscapeHatchConfig {
  /** Minimum unobserved gap seconds that counts as friction (600 = 10m). */
  frictionGapThresholdSeconds: number;
  /** Lookback window after the task start in which friction counts (1800 = 30m). */
  frictionLookbackSeconds: number;
  /** Window after the friction event in which escape activity counts (300 = 5m). */
  escapeAfterSeconds: number;
  /** Minimum qualifying (friction-observed) task starts (mirrors D1: 5). */
  minimumQualifyingTaskStarts: number;
  /** Minimum distinct local calendar days (mirrors D1: 3). */
  minimumDistinctCalendarDays: number;
  /** Minimum share of friction occasions followed by escape activity (2/3). */
  escapeShareThreshold: number;
  minimumPatternCoverageRatio: number;
  maximumUnknownFraction: number;
  detectorVersion: string;
  configurationVersion: string;
  sufficiency?: PatternSufficiency;
}

/** One task onset considered by the detector. */
export interface EscapeHatchEpisodeInput {
  taskId: string;
  session: Pick<WorkSession, "id" | "startedAt" | "endedAt" | "durationSeconds">;
  blocks: TemporalEvidenceBlock[];
}

/** Tier 1: episode measurement for one task onset. */
export interface EscapeHatchEpisodeMetrics {
  taskId: string;
  sessionId: string;
  taskStart: string;
  frictionAt: string | null;
  frictionEnd: string | null;
  frictionKind: EscapeFrictionKind | null;
  escapeAt: string | null;
  escapeKey: string | null;
  escaped: boolean;
  /** Honest coverage accounting over the friction-assessment window. */
  assessmentSpanSeconds: number;
  assessmentObservedSeconds: number;
  assessmentUnknownSeconds: number;
  status: "FRICTION_OBSERVED" | "NO_FRICTION_OBSERVED" | "NO_SESSION_EVIDENCE";
}

/** Tier 2: pattern metrics across friction-observed task onsets. */
export interface EscapeHatchPatternMetrics {
  escapeShare: number | null;
  escapedStarts: number;
  qualifyingStarts: number;
  totalStarts: number;
}
