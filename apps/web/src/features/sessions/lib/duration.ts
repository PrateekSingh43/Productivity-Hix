/**
 * Single duration-formatting strategy for session execution data.
 *
 * Session durations are stored as whole seconds. Display floors (never
 * rounds) so the UI can never overstate recorded execution; the exact
 * tooltip preserves the remainder. Use this everywhere a session duration
 * is rendered — history rows, day totals, metric ribbons, reflection
 * summaries — instead of per-file Math.round helpers that silently drop
 * up to 59 seconds each in different ways.
 *
 * Task *estimates* (`plannedDurationMinutes`, minute granularity) are a
 * different unit and keep their own trivial minute formatter at the call
 * site; do not pass estimates through these second-based helpers.
 */

/** Compact display: "45m", "1h 26m", "1h". Null/negative → "—" (unknown, not zero). */
export function formatSessionDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const floored = Math.floor(totalSeconds);
  if (floored < 60) return floored === 0 ? "0m" : `${floored}s`;
  const minutes = Math.floor(floored / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Exact display for tooltips: "1h 26m 14s", "45s". */
export function formatSessionDurationExact(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const floored = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(floored / 3600);
  const minutes = Math.floor((floored % 3600) / 60);
  const seconds = floored % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

/**
 * Target-vs-actual variance line for one session.
 * Positive values are over target, negative under; both are plain variance,
 * never "overtime" as a productivity judgment.
 */
export function formatTargetVariance(actualSeconds: number, targetMinutes: number): string {
  const diffMins = Math.round(actualSeconds / 60) - targetMinutes;
  if (diffMins === 0) return "on target";
  return diffMins > 0 ? `+${diffMins}m` : `${diffMins}m`;
}

/**
 * Minimum paused time worth disclosing in the UI. Sub-minute gaps are
 * timestamp precision / second-rounding noise; surfacing "Paused 14s"
 * would be clutter, not honesty.
 */
export const PAUSE_DISCLOSURE_THRESHOLD_SECONDS = 60;

export interface SessionSpan {
  /** Wall-clock `endedAt - startedAt` in seconds, or null while running. */
  wallDurationSeconds: number | null;
  /** Recorded active/focused seconds (`durationSeconds`, floored at 0). */
  activeDurationSeconds: number;
  /** `max(0, wall - active)` for ended sessions, else 0. Never negative. */
  pausedDurationSeconds: number;
  /** True when an ended session carries a disclosable pause gap. */
  hasMeaningfulPause: boolean;
}

/**
 * Single canonical decomposition of a completed session's time span.
 *
 * Domain semantics (server-audited): `durationSeconds` counts ACTIVE time
 * only — pause/resume accounting in the sessions service excludes paused
 * intervals — while `startedAt → endedAt` spans WALL time including them.
 * So for an ended session `active <= wall`, and the difference is total
 * paused time. This helper derives all three from the same record so every
 * session list (History, Task Drawer, …) shares one semantic source instead
 * of re-deriving wall/active inline in different ways.
 *
 * Precision: subtraction happens on whole seconds (durations are stored as
 * whole seconds; wall is rounded once from milliseconds). No minute-level
 * rounding before subtraction. Formatting is left to the canonical
 * `formatSessionDuration` / `formatSessionDurationExact` helpers.
 */
export function describeSessionSpan(
  startedAt: string,
  endedAt: string | null,
  durationSeconds: number | null | undefined,
): SessionSpan {
  const activeDurationSeconds = Math.max(0, Math.floor(durationSeconds ?? 0));
  if (!endedAt) {
    return {
      wallDurationSeconds: null,
      activeDurationSeconds,
      pausedDurationSeconds: 0,
      hasMeaningfulPause: false,
    };
  }
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(endedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return {
      wallDurationSeconds: null,
      activeDurationSeconds,
      pausedDurationSeconds: 0,
      hasMeaningfulPause: false,
    };
  }
  const wallDurationSeconds = Math.round((endMs - startMs) / 1000);
  const pausedDurationSeconds = Math.max(0, wallDurationSeconds - activeDurationSeconds);
  return {
    wallDurationSeconds,
    activeDurationSeconds,
    pausedDurationSeconds,
    hasMeaningfulPause: pausedDurationSeconds >= PAUSE_DISCLOSURE_THRESHOLD_SECONDS,
  };
}
