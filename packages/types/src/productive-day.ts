export interface ProductiveDayOptions {
  timezone?: string; // IANA timezone, e.g. "Asia/Kolkata", "America/New_York", "UTC"
  boundary?: string; // "HH:MM", default "00:00" (midnight)
}

export const DEFAULT_PRODUCTIVE_DAY_BOUNDARY = "00:00";

/**
 * Resolves a date/instant into a ProductiveHix day string ("YYYY-MM-DD")
 * based on user timezone and productive day boundary.
 *
 * Rule:
 * If the local time in the specified timezone is before the boundary (e.g. 04:00 if configured),
 * the timestamp belongs to the previous calendar day's productive cycle.
 * By default (00:00 boundary), it strictly follows the user's local calendar day.
 */
export function resolveProductiveDay(
  instant: Date | number | string = new Date(),
  options?: ProductiveDayOptions
): string {
  if (typeof instant === "string" && /^\d{4}-\d{2}-\d{2}$/.test(instant.trim())) {
    return instant.trim();
  }

  const date = instant instanceof Date ? instant : new Date(instant);
  const boundary = options?.boundary ?? DEFAULT_PRODUCTIVE_DAY_BOUNDARY;
  const timezone = options?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [bHourStr, bMinuteStr] = boundary.split(":");
  const bHour = parseInt(bHourStr || "4", 10);
  const bMinute = parseInt(bMinuteStr || "0", 10);

  // Format parts in the specified timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const findPart = (type: string) => parts.find((p) => p.type === type)?.value || "";

  let year = parseInt(findPart("year"), 10);
  let month = parseInt(findPart("month"), 10);
  let day = parseInt(findPart("day"), 10);
  let hour = parseInt(findPart("hour"), 10);
  let minute = parseInt(findPart("minute"), 10);

  // "24" hour check (some formatters emit 24:00 for midnight)
  if (hour === 24) hour = 0;

  // If local time < boundary, day belongs to previous calendar day
  if (hour < bHour || (hour === bHour && minute < bMinute)) {
    const prev = new Date(Date.UTC(year, month - 1, day - 1));
    year = prev.getUTCFullYear();
    month = prev.getUTCMonth() + 1;
    day = prev.getUTCDate();
  }

  const mm = month.toString().padStart(2, "0");
  const dd = day.toString().padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Resolves the next ProductiveHix date relative to the current resolved ProductiveHix date.
 *
 * Example:
 * If now is 02:30 on Sep 7, resolveProductiveDay returns 2026-09-06.
 * resolveTomorrowProductiveDay returns 2026-09-07 (the upcoming morning's plan!).
 * If now is 09:05 on Sep 7, resolveProductiveDay returns 2026-09-07.
 * resolveTomorrowProductiveDay returns 2026-09-08.
 */
export function resolveTomorrowProductiveDay(
  instant: Date | number | string = new Date(),
  options?: ProductiveDayOptions
): string {
  const currentProductiveDate = resolveProductiveDay(instant, options);
  const [y, m, d] = currentProductiveDate.split("-").map((num) => parseInt(num, 10));
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  const nextY = tomorrow.getUTCFullYear();
  const nextM = (tomorrow.getUTCMonth() + 1).toString().padStart(2, "0");
  const nextD = tomorrow.getUTCDate().toString().padStart(2, "0");
  return `${nextY}-${nextM}-${nextD}`;
}

export function formatProductiveDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map((num) => parseInt(num, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export interface LocalDayInterval {
  localDate: string; // "YYYY-MM-DD"
  timezone: string;
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  durationMs: number;
}

/**
 * Accurately converts a local calendar date and time (YYYY, MM, DD, HH, MM, SS)
 * in an IANA timezone into a UTC Date.
 * Handles DST transitions via fixed-point iterative convergence.
 */
export function localDateTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,   // 1-31
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(guess);
    const get = (t: string) => {
      const v = parts.find((p) => p.type === t)?.value;
      return v ? parseInt(v, 10) : 0;
    };
    let h = get("hour");
    if (h === 24) h = 0;
    const localAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), h, get("minute"), get("second"));
    const diff = Date.UTC(year, month - 1, day, hour, minute, second) - localAsUtc;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

/**
 * Resolves the canonical half-open [start, end) temporal interval for a local calendar date.
 *
 * Invariants:
 * - Start = local 00:00:00 converted to UTC Date
 * - End   = next local calendar date 00:00:00 converted to UTC Date
 * - Never calculates end as start + 24 hours (handles 23h and 25h DST days accurately)
 */
export function resolveLocalDayInterval(
  localDateOrInstant: string | Date | number = new Date(),
  options?: ProductiveDayOptions
): LocalDayInterval {
  const timezone = options?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  let localDate: string;

  if (typeof localDateOrInstant === "string" && /^\d{4}-\d{2}-\d{2}$/.test(localDateOrInstant.trim())) {
    localDate = localDateOrInstant.trim();
  } else {
    const date = localDateOrInstant instanceof Date ? localDateOrInstant : new Date(localDateOrInstant);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || "00";
    localDate = `${get("year")}-${get("month")}-${get("day")}`;
  }

  const [y, m, d] = localDate.split("-").map((num) => parseInt(num, 10));
  const start = localDateTimeToUtc(y, m, d, 0, 0, 0, timezone);

  const nextCal = new Date(Date.UTC(y, m - 1, d + 1));
  const nextY = nextCal.getUTCFullYear();
  const nextM = nextCal.getUTCMonth() + 1;
  const nextD = nextCal.getUTCDate();
  const end = localDateTimeToUtc(nextY, nextM, nextD, 0, 0, 0, timezone);

  return {
    localDate,
    timezone,
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    durationMs: end.getTime() - start.getTime(),
  };
}

/**
 * Determines all local calendar dates intersecting a half-open temporal range [start, end)
 * using the user's authoritative IANA timezone.
 *
 * Interval Semantics Invariant:
 * An event [start, end) touches day [DayStart, DayEnd) iff:
 * (start < DayEnd) AND (end > DayStart)
 *
 * Example:
 * 23:59:30 + 30s (end exactly 00:00:00) touches only the first day.
 * 23:59:30 + 31s (end 00:00:01) crosses midnight and touches both days.
 */
export function getDatesIntersectingInterval(
  start: Date,
  end: Date,
  timezone = "UTC"
): Array<{ localDate: string; interval: LocalDayInterval }> {
  if (end.getTime() <= start.getTime()) {
    const iv = resolveLocalDayInterval(start, { timezone });
    return [{ localDate: iv.localDate, interval: iv }];
  }

  const results: Array<{ localDate: string; interval: LocalDayInterval }> = [];
  let currentLocalDate = resolveLocalDayInterval(start, { timezone }).localDate;

  while (true) {
    const iv = resolveLocalDayInterval(currentLocalDate, { timezone });
    if (iv.start.getTime() >= end.getTime()) {
      break;
    }
    if (start.getTime() < iv.end.getTime() && end.getTime() > iv.start.getTime()) {
      results.push({ localDate: iv.localDate, interval: iv });
    }
    const [y, m, d] = currentLocalDate.split("-").map((num) => parseInt(num, 10));
    const nextCal = new Date(Date.UTC(y, m - 1, d + 1));
    const nextM = (nextCal.getUTCMonth() + 1).toString().padStart(2, "0");
    const nextD = nextCal.getUTCDate().toString().padStart(2, "0");
    currentLocalDate = `${nextCal.getUTCFullYear()}-${nextM}-${nextD}`;
  }

  return results;
}

