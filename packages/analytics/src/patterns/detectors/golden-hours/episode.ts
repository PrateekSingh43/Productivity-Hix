import { safeDivide } from "../../shared/math";
import {
  checkInsForWindow,
  goldenHoursDayWindows,
  summarizeGoldenHoursWindow,
} from "./sequence";
import type {
  GoldenHoursConfig,
  GoldenHoursDayEpisode,
  GoldenHoursDayEpisodeInput,
} from "./types";

/**
 * Golden-hours day episodes (pure/deterministic).
 *
 * Purpose: build one per-day episode comparing the AM window against the PM
 * window (switches/hr plus mean focus score) from clipped evidence blocks,
 * overlapping sessions, and attributed check-ins.
 *
 * Units: seconds for durations; switches/hour for rates; ordinal 1-3 focus
 * means. Assumes day windows from goldenHoursDayWindows are UTC ISO bounds.
 *
 * Edge cases: a day is QUALIFIED only when both windows each contribute at
 * least minimumWindowObservedSeconds AND both rates are non-null. Days below
 * the floor report INSUFFICIENT_EVIDENCE with partial metrics preserved.
 * supportsAmCalmer requires a strict AM < PM rate gap; focus acts only as
 * agreement (AM mean >= PM mean) when both windows carry ratings, otherwise
 * the switches/hr contrast alone decides (focus is never invented).
 */

function sessionOverlapsDay(
  sessions: GoldenHoursDayEpisodeInput["sessions"],
  dayStart: string,
  dayEnd: string,
): GoldenHoursDayEpisodeInput["sessions"] {
  const ws = Date.parse(dayStart);
  const we = Date.parse(dayEnd);
  return sessions.filter((session) => {
    if (!session.endedAt) return false;
    return Date.parse(session.startedAt) < we && Date.parse(session.endedAt) > ws;
  });
}

export function evaluateGoldenHoursDayEpisode(
  date: string,
  amWindow: { start: string; end: string },
  pmWindow: { start: string; end: string },
  input: GoldenHoursDayEpisodeInput,
  config: GoldenHoursConfig,
): GoldenHoursDayEpisode {
  const am = summarizeGoldenHoursWindow(input.blocks, input.reports, amWindow);
  const pm = summarizeGoldenHoursWindow(input.blocks, input.reports, pmWindow);
  const spanSeconds =
    Math.max(0, (Date.parse(amWindow.end) - Date.parse(amWindow.start)) / 1000) +
    Math.max(0, (Date.parse(pmWindow.end) - Date.parse(pmWindow.start)) / 1000);
  const observedSeconds = am.observedSeconds + pm.observedSeconds;
  const coverageRatio = spanSeconds > 0 ? (safeDivide(observedSeconds, spanSeconds) ?? 0) : 0;
  const unknownFraction =
    spanSeconds > 0 ? (safeDivide(am.unknownSeconds + pm.unknownSeconds, spanSeconds) ?? 1) : 1;

  const qualified =
    am.observedSeconds >= config.minimumWindowObservedSeconds &&
    pm.observedSeconds >= config.minimumWindowObservedSeconds &&
    am.switchesPerHour !== null &&
    pm.switchesPerHour !== null;
  const rateGap =
    am.switchesPerHour !== null && pm.switchesPerHour !== null && am.switchesPerHour < pm.switchesPerHour;
  const focusAgrees =
    am.meanFocusScore === null || pm.meanFocusScore === null || am.meanFocusScore >= pm.meanFocusScore;

  const dayStart = amWindow.start < pmWindow.start ? amWindow.start : pmWindow.start;
  const dayEnd = amWindow.end > pmWindow.end ? amWindow.end : pmWindow.end;
  const overlappingSessions = sessionOverlapsDay(input.sessions, dayStart, dayEnd);
  const sessionIds = [...new Set(overlappingSessions.map((session) => session.id))].sort();
  const reportIds = [
    ...new Set(
      [amWindow, pmWindow].flatMap((window) =>
        checkInsForWindow(input.reports, window).map((report) => report.id),
      ),
    ),
  ].sort();

  return {
    date,
    amWindow: { ...amWindow },
    pmWindow: { ...pmWindow },
    am,
    pm,
    coverageRatio,
    unknownFraction,
    windowSpanSeconds: spanSeconds,
    observedSeconds,
    executionStatus: qualified ? "QUALIFIED" : "INSUFFICIENT_EVIDENCE",
    supportsAmCalmer: qualified && rateGap && focusAgrees,
    sessionIds,
    reportIds,
  };
}

/**
 * Collects one day-episode per local day overlapping the analytical window.
 * Sorted by AM start; deterministic for fixed inputs.
 */
export function collectGoldenHoursDayEpisodes(
  input: GoldenHoursDayEpisodeInput,
  config: GoldenHoursConfig,
): GoldenHoursDayEpisode[] {
  return goldenHoursDayWindows(input.window, input.timezone, config).map((day) =>
    evaluateGoldenHoursDayEpisode(day.date, day.am, day.pm, input, config),
  );
}
