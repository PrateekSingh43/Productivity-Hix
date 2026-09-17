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

  // Use Intl.DateTimeFormat with "en-CA" which guarantees YYYY-MM-DD output
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const distinctDays = new Set<string>();

  for (const timestamp of utcTimestamps) {
    const dateObj = new Date(timestamp);
    if (!Number.isFinite(dateObj.getTime())) continue;

    // Output format is YYYY-MM-DD
    const formatted = formatter.format(dateObj);
    distinctDays.add(formatted);
  }

  return distinctDays.size;
}

/**
 * Subtracts calendar days from a UTC timestamp in a specific timezone, preserving the local time of day.
 * Accounts for DST shifts by searching for the matching local time.
 */
export function subtractCalendarDays(utcTimestamp: string, days: number, timezone: string): string {
  const date = new Date(utcTimestamp);
  
  const getLocalDate = (d: Date) => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
  };
  
  const getLocalTime = (d: Date) => {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(d);
  };
  
  const localDateStr = getLocalDate(date);
  const localTimeStr = getLocalTime(date);
  
  const parts = localDateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  
  calendarDate.setUTCDate(calendarDate.getUTCDate() - days);
  
  const targetYear = calendarDate.getUTCFullYear();
  const targetMonth = String(calendarDate.getUTCMonth() + 1).padStart(2, '0');
  const targetDay = String(calendarDate.getUTCDate()).padStart(2, '0');
  const targetDateStr = `${targetYear}-${targetMonth}-${targetDay}`;
  
  let approx = new Date(date.getTime() - days * 86400 * 1000);
  
  for (let i = -24; i <= 24; i++) {
    const testDate = new Date(approx.getTime() + i * 3600 * 1000);
    if (getLocalDate(testDate) === targetDateStr && getLocalTime(testDate) === localTimeStr) {
      // Need to maintain original milliseconds if any
      testDate.setUTCMilliseconds(date.getUTCMilliseconds());
      return testDate.toISOString();
    }
  }
  
  // Fallback if not found due to a missing hour (e.g. spring forward exact match failure).
  // DST note: this returns a fractional-hour-shifted timestamp (local wall time shifts by
  // the DST offset) rather than failing; acceptable per W2-S spec — document, do not hide.
  return approx.toISOString();
}
