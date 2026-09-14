/**
 * Shared Temporal guards and logic for Phase 4 Analytics.
 */

/**
 * Validates that two temporal boundaries are strictly ordered.
 * Required to prevent inverted windows or negative durations.
 */
export function isValidTemporalWindow(startUTC: string, endUTC: string): boolean {
  const start = new Date(startUTC).getTime();
  const end = new Date(endUTC).getTime();
  
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }
  
  return start < end;
}

/**
 * Validates that the baseline window strictly precedes or ends exactly at the start of the evaluation window.
 * This ensures no evidence leaks from the evaluation window into the baseline distribution.
 */
export function isValidBaselinePrecedence(baselineEndUTC: string, evaluationStartUTC: string): boolean {
  const baselineEnd = new Date(baselineEndUTC).getTime();
  const evalStart = new Date(evaluationStartUTC).getTime();

  if (!Number.isFinite(baselineEnd) || !Number.isFinite(evalStart)) {
    return false;
  }

  return baselineEnd <= evalStart;
}

/**
 * Groups UTC timestamps by their unique local calendar date in the specified timezone.
 * Returns the number of distinct local calendar days.
 * 
 * E.g., if two events happen at 23:00 UTC and 01:00 UTC next day, but in a timezone
 * where they both fall on the same local calendar date, this will count as 1 day.
 */
export function countDistinctCalendarDays(utcTimestamps: string[], timezone: string): number {
  if (!utcTimestamps || utcTimestamps.length === 0) return 0;

  // Use Intl.DateTimeFormat to deterministically extract the local date components
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const distinctDays = new Set<string>();

  for (const timestamp of utcTimestamps) {
    const dateObj = new Date(timestamp);
    if (!Number.isFinite(dateObj.getTime())) continue;

    // Output format is MM/DD/YYYY
    const formatted = formatter.format(dateObj);
    distinctDays.add(formatted);
  }

  return distinctDays.size;
}
