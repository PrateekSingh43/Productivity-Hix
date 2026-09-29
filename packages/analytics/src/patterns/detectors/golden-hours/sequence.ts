import type { CheckIn, TemporalEvidenceBlock } from "@repo/types";

import { focusScoreFor, type GoldenHoursConfig, type GoldenHoursWindowSummary } from "./types";

/**
 * Golden-hours window helpers (pure/deterministic).
 *
 * Purpose: resolve the fixed local-time AM/PM windows to UTC bounds per local
 * day, clip evidence blocks to a window, and summarize qualifying observed
 * activity (switch count, observed/unknown seconds) plus check-in focus means.
 *
 * Units: seconds for durations, switches/hour for rates, ordinal 1-3 for
 * focus means. Assumes block bounds are valid UTC ISO strings and the
 * timezone is a valid IANA name (Intl-resolved, as in temporal.ts).
 *
 * Edge cases: local-to-UTC resolution iterates a UTC guess against the
 * Intl wall clock (3 passes); across DST transitions it converges to the
 * nearest valid instant rather than failing. Blocks straddling a window edge
 * contribute only their overlapping seconds; a switch is counted only between
 * two consecutive qualifying blocks that both overlap the window. AFK, break,
 * unobserved, and keyless blocks end a context run instead of contributing
 * switches (same boundary semantics as parseContextSequence). Unknown seconds
 * count only coverage-UNKNOWN overlap; AFK/break/REPORTED/EXPLAINED_GAP
 * overlap is excluded from both observed and unknown numerators.
 */

export interface DayWindowBounds {
  date: string;
  am: { start: string; end: string };
  pm: { start: string; end: string };
}

function wallParts(timezone: string, instantMs: number): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(instantMs));
  const out: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return out;
}

/**
 * Resolves a local wall-clock time (minutes since midnight) on a local date
 * to a UTC ISO instant. Deterministic; DST-ambiguous times converge to the
 * nearest valid instant.
 */
export function localWallToUtc(date: string, minutes: number, timezone: string): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  const wantMs = Date.parse(`${date}T${hh}:${mm}:00.000Z`);
  let guess = wantMs;
  for (let i = 0; i < 3; i++) {
    const wall = wallParts(timezone, guess);
    const wallMs = Date.parse(
      `${wall["year"]}-${wall["month"]}-${wall["day"]}T${wall["hour"]}:${wall["minute"]}:${wall["second"]}.000Z`,
    );
    if (!Number.isFinite(wallMs)) break;
    const diff = wallMs - wantMs;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess).toISOString();
}

/**
 * Enumerates the local days whose AM/PM windows overlap the analytical
 * window, with UTC bounds per window. Sorted by AM start.
 */
export function goldenHoursDayWindows(
  window: { start: string; end: string },
  timezone: string,
  config: GoldenHoursConfig,
): DayWindowBounds[] {
  const startMs = Date.parse(window.start);
  const endMs = Date.parse(window.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !(startMs < endMs)) return [];
  const dayFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dates = new Set<string>();
  for (let t = startMs - 86400000; t <= endMs + 86400000; t += 86400000) {
    dates.add(dayFormat.format(new Date(t)));
  }
  return [...dates]
    .map((date) => ({
      date,
      am: {
        start: localWallToUtc(date, config.amStartMinutes, timezone),
        end: localWallToUtc(date, config.amEndMinutes, timezone),
      },
      pm: {
        start: localWallToUtc(date, config.pmStartMinutes, timezone),
        end: localWallToUtc(date, config.pmEndMinutes, timezone),
      },
    }))
    .filter((day) => day.am.start < window.end && day.pm.end > window.start)
    .sort((a, b) => (a.am.start < b.am.start ? -1 : a.am.start > b.am.start ? 1 : 0));
}

function canonicalContextKey(block: TemporalEvidenceBlock): string | null {
  const obs = block.observation;
  if (!obs) return null;
  if (obs.category === "browser" && obs.domain) return `browser:${obs.domain}`;
  if (obs.application) return `app:${obs.application}`;
  return null;
}

function overlapSeconds(start: string, end: string, window: { start: string; end: string }): number {
  const overlapMs =
    Math.min(Date.parse(end), Date.parse(window.end)) - Math.max(Date.parse(start), Date.parse(window.start));
  return overlapMs > 0 ? overlapMs / 1000 : 0;
}

/**
 * Checks-ins attributed to a window: overlap of [windowStart, windowEnd] when
 * the check-in carries its own window, else createdAt falling inside.
 */
export function checkInsForWindow(reports: CheckIn[], window: { start: string; end: string }): CheckIn[] {
  const ws = Date.parse(window.start);
  const we = Date.parse(window.end);
  return reports.filter((report) => {
    if (report.windowStart && report.windowEnd) {
      const rs = Date.parse(report.windowStart);
      const re = Date.parse(report.windowEnd);
      return Number.isFinite(rs) && Number.isFinite(re) && rs < we && re > ws;
    }
    const created = Date.parse(report.createdAt);
    return Number.isFinite(created) && created >= ws && created < we;
  });
}

/**
 * Summarizes one window: switch count over qualifying observed overlap,
 * observed/unknown seconds, and the mean of mapped focus scores.
 */
export function summarizeGoldenHoursWindow(
  blocks: TemporalEvidenceBlock[],
  reports: CheckIn[],
  window: { start: string; end: string },
): GoldenHoursWindowSummary {
  const ws = Date.parse(window.start);
  const we = Date.parse(window.end);
  const overlapping = blocks
    .filter((block) => Date.parse(block.startTime) < we && Date.parse(block.endTime) > ws)
    .sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
      if (a.endTime !== b.endTime) return a.endTime < b.endTime ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  let switchCount = 0;
  let observedSeconds = 0;
  let unknownSeconds = 0;
  const blockIds: string[] = [];
  let currentKey: string | null = null;

  for (const block of overlapping) {
    const overlap = overlapSeconds(block.startTime, block.endTime, window);
    if (overlap <= 0) continue;
    const obs = block.observation;
    if (block.coverage === "UNKNOWN") {
      unknownSeconds += overlap;
      currentKey = null;
      continue;
    }
    const qualifying =
      (block.coverage === "OBSERVED" || block.coverage === "OBSERVED_REPORTED") &&
      obs?.isAfk !== true &&
      obs?.category !== "break";
    const key = qualifying ? canonicalContextKey(block) : null;
    if (key === null) {
      currentKey = null;
      continue;
    }
    observedSeconds += overlap;
    blockIds.push(block.id);
    if (currentKey === null) {
      currentKey = key;
    } else if (currentKey !== key) {
      switchCount += 1;
      currentKey = key;
    }
  }

  const scores = checkInsForWindow(reports, window)
    .map((report) => focusScoreFor(report.focus))
    .filter((score): score is number => score !== null);
  const observedHours = observedSeconds / 3600;

  return {
    switchesPerHour: observedHours > 0 ? switchCount / observedHours : null,
    meanFocusScore: scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
    observedSeconds,
    unknownSeconds,
    switchCount,
    focusRatingCount: scores.length,
    blockIds: [...new Set(blockIds)].sort(),
  };
}
