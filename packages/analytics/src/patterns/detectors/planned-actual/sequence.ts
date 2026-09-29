import { safeDivide } from "../../shared/math";
import type { PlannedActualEpisodeInput } from "./types";

/**
 * Planned-vs-actual sequence helpers (pure/deterministic).
 *
 * Purpose: sum recorded session time per task and divide by the declared
 * plan. Session duration prefers the stored durationSeconds when positive,
 * else falls back to endedAt - startedAt; sessions with neither contribute
 * nothing and are never invented.
 *
 * Units: minutes for durations; biasRatio is unitless.
 *
 * Edge cases: biasRatio is null when the plan is null/non-positive or when
 * no positive session time exists (division by zero or missing evidence is
 * never papered over with a zero fill).
 */

export function actualMinutesFor(
  sessions: PlannedActualEpisodeInput["sessions"],
): number | null {
  let total = 0;
  let contributed = false;
  for (const session of sessions) {
    if (typeof session.durationSeconds === "number" && session.durationSeconds > 0) {
      total += session.durationSeconds / 60;
      contributed = true;
    } else if (session.startedAt && session.endedAt) {
      const durMs = Date.parse(session.endedAt) - Date.parse(session.startedAt);
      if (Number.isFinite(durMs) && durMs > 0) {
        total += durMs / 60_000;
        contributed = true;
      }
    }
  }
  return contributed ? total : null;
}

/** actual / planned; null when the plan is missing/non-positive or actual is missing. */
export function biasRatioFor(
  plannedDurationMinutes: number | null | undefined,
  actualDurationMinutes: number | null,
): number | null {
  if (
    typeof plannedDurationMinutes !== "number" ||
    !Number.isFinite(plannedDurationMinutes) ||
    plannedDurationMinutes <= 0 ||
    actualDurationMinutes === null
  ) {
    return null;
  }
  return safeDivide(actualDurationMinutes, plannedDurationMinutes);
}
