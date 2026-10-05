import {
  localDateTimeToUtc,
  resolveProductiveDay,
  DEFAULT_PRODUCTIVE_DAY_BOUNDARY,
} from "@repo/types";

/**
 * Canonical session-history date ranges.
 *
 * Every preset and custom selection resolves to a half-open UTC interval
 * [from, to) built from PRODUCTIVE days (timezone + day boundary aware) —
 * never from raw `Date.now() - N*24h` wall-clock arithmetic and never from
 * local-midnight guessing. The API filters `startedAt` against this window;
 * grouping elsewhere must use the same productive-day resolution so a
 * session can never fall into a different day in the list than in the group.
 *
 * Timezone/boundary come from user preferences with safe fallbacks
 * (browser timezone, "00:00") while preferences load.
 */
export type SessionDatePreset = "today" | "7d" | "30d" | "90d" | "custom" | "all";

export interface SessionRangeOptions {
  timezone?: string;
  boundary?: string;
  now?: Date;
  customFrom?: string;
  customTo?: string;
}

export interface SessionDateRange {
  from?: string;
  to?: string;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function parseBoundary(boundary: string): { hour: number; minute: number } {
  const [h, m] = boundary.split(":").map((n) => parseInt(n, 10));
  return {
    hour: Number.isFinite(h) ? h : 0,
    minute: Number.isFinite(m) ? m : 0,
  };
}

function shiftDay(day: string, deltaDays: number): string {
  const [y, m, d] = day.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

export { shiftDay };

/**
 * The last N productive days ending today, oldest-first. Backs the
 * descriptive 7-day focus rhythm strip (presence per day, never a
 * consecutive-day streak counter).
 */
export function lastProductiveDays(
  count: number,
  options: SessionRangeOptions = {},
): string[] {
  const timezone =
    options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const boundary = options.boundary ?? DEFAULT_PRODUCTIVE_DAY_BOUNDARY;
  const today = resolveProductiveDay(options.now ?? new Date(), { timezone, boundary });
  const days: string[] = [];
  for (let i = count - 1; i >= 0; i--) days.push(shiftDay(today, -i));
  return days;
}

/** Start instant (UTC) of productive day `day` under the given boundary. */
export function productiveDayStart(
  day: string,
  timezone: string,
  boundary: string,
): Date {
  const [y, m, d] = day.split("-").map((n) => parseInt(n, 10));
  const { hour, minute } = parseBoundary(boundary);
  return localDateTimeToUtc(y, m, d, hour, minute, 0, timezone);
}

export function resolveSessionDateRange(
  preset: SessionDatePreset,
  options: SessionRangeOptions = {},
): SessionDateRange {
  const timezone =
    options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const boundary = options.boundary ?? DEFAULT_PRODUCTIVE_DAY_BOUNDARY;
  const now = options.now ?? new Date();

  if (preset === "all") return {};

  if (preset === "custom") {
    const from = (options.customFrom ?? "").trim();
    const to = (options.customTo ?? "").trim();
    if (!DAY_KEY.test(from) || !DAY_KEY.test(to)) {
      throw new Error("Custom range requires From and To dates (YYYY-MM-DD).");
    }
    if (from > to) {
      throw new Error("Custom range From must not be after To.");
    }
    return {
      from: productiveDayStart(from, timezone, boundary).toISOString(),
      to: productiveDayStart(shiftDay(to, 1), timezone, boundary).toISOString(),
    };
  }

  const days = preset === "today" ? 1 : preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const today = resolveProductiveDay(now, { timezone, boundary });
  return {
    from: productiveDayStart(shiftDay(today, -(days - 1)), timezone, boundary).toISOString(),
    to: productiveDayStart(shiftDay(today, 1), timezone, boundary).toISOString(),
  };
}
