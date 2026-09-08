import type { CheckIn, NormalizedActivityEvent } from "@repo/types";
import { findDiscrepancies } from "../productivity/discrepancies";

export interface CheckInFeatures {
  checkInId: string;
  timestamp: string;
  windowStart: string | null;
  windowEnd: string | null;
  focus: string | null;
  energy: string | null;
  state: string | null;
  productive: boolean | null;
  progress: boolean | null;
  reasonCount: number;
  hasBlocker: boolean;
  hasOutcome: boolean;
  observedActiveSeconds: number | null;
}

/**
 * Extracts canonical check-in measurement features.
 * Note: Subjective fields (focus, energy, state) are preserved without score reinterpretation.
 */
export function extractCheckInFeatures(
  checkIn: CheckIn,
  events?: NormalizedActivityEvent[],
): CheckInFeatures {
  let observedActiveSeconds: number | null = null;

  if (events) {
    const discrepancies = findDiscrepancies([checkIn], events);
    observedActiveSeconds = discrepancies[0]?.observedActiveSeconds ?? null;
  }

  const hasBlocker = Boolean(checkIn.blocker && checkIn.blocker.trim().length > 0);
  const hasOutcome = Boolean(
    (checkIn.outcome && checkIn.outcome.trim().length > 0) ||
      (checkIn.note && checkIn.note.trim().length > 0),
  );

  return {
    checkInId: checkIn.id,
    timestamp: checkIn.createdAt,
    windowStart: checkIn.windowStart ?? null,
    windowEnd: checkIn.windowEnd ?? null,
    focus: checkIn.focus ?? null,
    energy: checkIn.energy ?? null,
    state: checkIn.state ?? null,
    productive: checkIn.productive ?? null,
    progress: checkIn.progress ?? null,
    reasonCount: checkIn.reasons?.length ?? 0,
    hasBlocker,
    hasOutcome,
    observedActiveSeconds,
  };
}
