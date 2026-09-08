export interface ProductiveDayOptions {
  timezone?: string; // IANA timezone, e.g. "Asia/Kolkata", "America/New_York", "UTC"
  boundary?: string; // "HH:MM", default "04:00"
}

export const DEFAULT_PRODUCTIVE_DAY_BOUNDARY = "04:00";

/**
 * Resolves a date/instant into a ProductiveHix day string ("YYYY-MM-DD")
 * based on user timezone and productive day boundary.
 *
 * Rule:
 * If the local time in the specified timezone is before the boundary (e.g. 04:00),
 * the timestamp belongs to the previous calendar day's productive cycle.
 */
export function resolveProductiveDay(
  instant: Date | number | string = new Date(),
  options?: ProductiveDayOptions
): string {
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
