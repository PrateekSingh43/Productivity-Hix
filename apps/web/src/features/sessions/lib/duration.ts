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
