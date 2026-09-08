import type { CheckIn, NormalizedActivityEvent } from "@repo/types";
import { isIdleActivity } from "../activity/categories";

export type SelfReportDiscrepancy = {
  checkInId: string;
  reportedProductive: boolean | null;
  observedActiveSeconds: number;
  note:
    | "reported-progress-without-observed-time"
    | "observed-time-without-progress"
    | "aligned"
    | "insufficient-evidence";
};

type WindowInterval = {
  start: number;
  end: number;
};

/**
 * Determines the half-open telemetry interval [start, end) for a check-in.
 *
 * Rules:
 * - Case 1: Both windowStart and windowEnd exist and end > start -> [windowStart, windowEnd)
 * - Case 2: Only windowStart exists -> [windowStart, createdAt) ONLY if createdAt > windowStart. Else null.
 * - Case 3: Only windowEnd exists -> null (no reliable window)
 * - Case 4: Neither exists -> null (no reliable window)
 */
function getCheckInWindow(checkIn: CheckIn): WindowInterval | null {
  const startMs = checkIn.windowStart ? Date.parse(checkIn.windowStart) : NaN;
  const endMs = checkIn.windowEnd ? Date.parse(checkIn.windowEnd) : NaN;

  const hasStart = !Number.isNaN(startMs);
  const hasEnd = !Number.isNaN(endMs);

  // Case 1: Both boundaries exist and windowEnd > windowStart
  if (hasStart && hasEnd && endMs > startMs) {
    return { start: startMs, end: endMs };
  }

  // Case 2: Only windowStart exists -> use [windowStart, createdAt) if createdAt > windowStart
  if (hasStart && !hasEnd) {
    const createdMs = checkIn.createdAt ? Date.parse(checkIn.createdAt) : NaN;
    if (!Number.isNaN(createdMs) && createdMs > startMs) {
      return { start: startMs, end: createdMs };
    }
    return null;
  }

  // Case 3 & 4: Only windowEnd or neither -> no reliable window
  return null;
}

/**
 * Calculates the non-overlapping active duration within a half-open window [windowStart, windowEnd).
 */
function calculateObservedActiveSeconds(
  events: NormalizedActivityEvent[],
  window: WindowInterval,
): number {
  const intervals: WindowInterval[] = [];

  for (const event of events) {
    if (isIdleActivity(event)) continue;

    const durationSec = event.duration;
    if (typeof durationSec !== "number" || durationSec <= 0 || Number.isNaN(durationSec)) {
      continue;
    }

    const evStart = Date.parse(event.timestamp);
    if (Number.isNaN(evStart)) continue;

    const evEnd = evStart + durationSec * 1000;

    // Strict half-open overlap check with [window.start, window.end)
    if (evStart >= window.end || evEnd <= window.start) {
      continue;
    }

    // Clip to check-in window
    const clipStart = Math.max(evStart, window.start);
    const clipEnd = Math.min(evEnd, window.end);
    if (clipEnd > clipStart) {
      intervals.push({ start: clipStart, end: clipEnd });
    }
  }

  if (intervals.length === 0) return 0;

  // Merge overlapping active intervals to avoid double-counting
  intervals.sort((a, b) => a.start - b.start);
  const merged: WindowInterval[] = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ start: interval.start, end: interval.end });
    }
  }

  return merged.reduce((sum, item) => sum + (item.end - item.start) / 1000, 0);
}

export function findDiscrepancies(
  checkIns: CheckIn[],
  events: NormalizedActivityEvent[],
): SelfReportDiscrepancy[] {
  return checkIns.map((checkIn): SelfReportDiscrepancy => {
    const window = getCheckInWindow(checkIn);

    if (!window) {
      return {
        checkInId: checkIn.id,
        reportedProductive: checkIn.productive,
        observedActiveSeconds: 0,
        note: "insufficient-evidence",
      };
    }

    const observedActiveSeconds = calculateObservedActiveSeconds(events, window);

    let note: SelfReportDiscrepancy["note"];
    if (checkIn.progress && observedActiveSeconds < 60) {
      note = "reported-progress-without-observed-time";
    } else if (checkIn.progress === false && observedActiveSeconds >= 30 * 60) {
      note = "observed-time-without-progress";
    } else {
      note = "aligned";
    }

    return {
      checkInId: checkIn.id,
      reportedProductive: checkIn.productive,
      observedActiveSeconds,
      note,
    };
  });
}

