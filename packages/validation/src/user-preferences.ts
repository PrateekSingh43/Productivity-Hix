import { z } from "zod";

/**
 * Normalizes timezone strings. Explicitly converts deprecated IANA "Asia/Calcutta"
 * to canonical "Asia/Kolkata".
 */
export function normalizeTimezone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  const trimmed = tz.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "asia/calcutta" || trimmed.toLowerCase().includes("calcutta")) {
    return "Asia/Kolkata";
  }
  return trimmed;
}

export const PREFERRED_TIMEZONES = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST • UTC+05:30)" },
  { value: "America/New_York", label: "America/New_York (EST • UTC-05:00)" },
  { value: "America/Chicago", label: "America/Chicago (CST • UTC-06:00)" },
  { value: "America/Denver", label: "America/Denver (MST • UTC-07:00)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST • UTC-08:00)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST • UTC+00:00)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET • UTC+01:00)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET • UTC+01:00)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST • UTC+04:00)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT • UTC+08:00)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST • UTC+09:00)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST • UTC+10:00)" },
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
];

export const userPreferencesBaseSchema = z.object({
  dayBoundary: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM format (00:00 - 23:59)"),
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM format (00:00 - 23:59)"),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM format (00:00 - 23:59)"),
  timezone: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform((val) => normalizeTimezone(val)),
  suppressCheckInsDuringFocus: z.boolean().default(true),
});

export const userPreferencesSchema = z.object({
  dayBoundary: userPreferencesBaseSchema.shape.dayBoundary.default("00:00"),
  quietHoursEnabled: userPreferencesBaseSchema.shape.quietHoursEnabled.default(true),
  quietHoursStart: userPreferencesBaseSchema.shape.quietHoursStart.default("23:58"),
  quietHoursEnd: userPreferencesBaseSchema.shape.quietHoursEnd.default("08:00"),
  timezone: userPreferencesBaseSchema.shape.timezone,
  suppressCheckInsDuringFocus: userPreferencesBaseSchema.shape.suppressCheckInsDuringFocus.default(true),
});


export const userPreferencesUpdateSchema = userPreferencesBaseSchema.partial();

export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
export type UserPreferencesUpdateInput = z.infer<typeof userPreferencesUpdateSchema>;

/**
 * Converts a 24-hour "HH:MM" string to a strict 12-hour AM/PM label.
 * E.g. "00:00" -> "12:00 AM (Midnight)", "12:00" -> "12:00 PM (Noon)", "23:58" -> "11:58 PM".
 */
export function formatTimeTo12Hour(time24: string, options?: { showAnnotations?: boolean }): string {
  const parts = time24.split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return time24;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const hourStr = String(hour12).padStart(2, "0");
  const minuteStr = String(minutes).padStart(2, "0");
  const base12 = `${hourStr}:${minuteStr} ${period}`;

  if (options?.showAnnotations) {
    if (time24 === "00:00") return "12:00 AM (Midnight)";
    if (time24 === "12:00") return "12:00 PM (Noon)";
  }

  return base12;
}

/**
 * Returns all 24 hours of the day formatted strictly as 12-hour AM/PM options.
 */
export function getDayBoundaryOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  for (let h = 0; h < 24; h++) {
    const value = `${String(h).padStart(2, "0")}:00`;
    const label = formatTimeTo12Hour(value, { showAnnotations: true });
    options.push({ value, label });
  }
  return options;
}

/**
 * Returns 30-minute interval options across 24 hours in strict 12-hour AM/PM format,
 * plus ensures any custom values (like default "23:58" / 11:58 PM) are included in order.
 */
export function getQuietHoursOptions(includeValues: string[] = []): Array<{ value: string; label: string }> {
  const map = new Map<string, string>();

  // Add standard 30-minute intervals
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      map.set(value, formatTimeTo12Hour(value, { showAnnotations: true }));
    }
  }

  // Ensure included values (e.g. "23:58") are present
  for (const v of includeValues) {
    if (v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) && !map.has(v)) {
      map.set(v, formatTimeTo12Hour(v, { showAnnotations: false }));
    }
  }

  // Sort chronologically by minutes from 00:00
  return Array.from(map.entries())
    .map(([value, label]) => {
      const [h, m] = value.split(":").map(Number);
      return { value, label, totalMinutes: (h ?? 0) * 60 + (m ?? 0) };
    })
    .sort((a, b) => a.totalMinutes - b.totalMinutes)
    .map(({ value, label }) => ({ value, label }));
}
