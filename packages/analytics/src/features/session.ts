import type { NormalizedActivityEvent, TimelineCategory, TimelineSegment, WorkSession } from "@repo/types";
import { aggregateActivitySegments } from "../activity/segments";

export interface SessionFeatures {
  durationSeconds: number;
  activeDurationSeconds: number;
  contextCount: number;
  contextSwitchCount: number;
  contextSwitchesPerHour: number;
  productiveDurationSeconds: number;
  idleDurationSeconds: number;
  distractionDurationSeconds: number;
}

export interface ActivityInterval {
  start: number;
  end: number;
  durationSeconds: number;
  category: TimelineCategory;
  context: string;
}

/**
 * Normalizes input activity into non-overlapping classified intervals clipped to a time window.
 */
export function normalizeToIntervals(
  eventsOrSegments: NormalizedActivityEvent[] | TimelineSegment[],
  windowStartMs: number,
  windowEndMs: number,
): ActivityInterval[] {
  if (eventsOrSegments.length === 0 || windowEndMs <= windowStartMs) {
    return [];
  }

  // If already TimelineSegment[], reuse directly; otherwise aggregate via canonical segment logic
  const isSegmentList = (items: NormalizedActivityEvent[] | TimelineSegment[]): items is TimelineSegment[] => {
    return items.length > 0 && "category" in items[0]! && "durationMs" in items[0]!;
  };

  const segments: TimelineSegment[] = isSegmentList(eventsOrSegments)
    ? eventsOrSegments
    : aggregateActivitySegments(eventsOrSegments as any);

  const intervals: ActivityInterval[] = [];

  for (const seg of segments) {
    const segStart = Date.parse(seg.start);
    const segEnd = Date.parse(seg.end);

    if (Number.isNaN(segStart) || Number.isNaN(segEnd)) continue;
    if (segStart >= windowEndMs || segEnd <= windowStartMs) continue;

    const clipStart = Math.max(segStart, windowStartMs);
    const clipEnd = Math.min(segEnd, windowEndMs);
    const durationSeconds = Math.round((clipEnd - clipStart) / 1000);

    if (durationSeconds <= 0) continue;

    const context = seg.title ? `${seg.application}: ${seg.title}` : seg.application;

    intervals.push({
      start: clipStart,
      end: clipEnd,
      durationSeconds,
      category: seg.category,
      context,
    });
  }

  return intervals.sort((a, b) => a.start - b.start);
}

/**
 * Extracts canonical session-level features for a derived work session.
 */
export function extractSessionFeatures(
  session: WorkSession,
  eventsOrSegments: NormalizedActivityEvent[] | TimelineSegment[] = [],
): SessionFeatures {
  const sessionStartMs = Date.parse(session.startedAt);
  const sessionEndMs = session.endedAt
    ? Date.parse(session.endedAt)
    : sessionStartMs + (session.durationSeconds ?? 0) * 1000;

  const durationSeconds =
    session.durationSeconds ??
    (Number.isNaN(sessionStartMs) || Number.isNaN(sessionEndMs)
      ? 0
      : Math.max(0, Math.round((sessionEndMs - sessionStartMs) / 1000)));

  if (Number.isNaN(sessionStartMs) || Number.isNaN(sessionEndMs) || sessionEndMs <= sessionStartMs) {
    return {
      durationSeconds: 0,
      activeDurationSeconds: 0,
      contextCount: 0,
      contextSwitchCount: 0,
      contextSwitchesPerHour: 0,
      productiveDurationSeconds: 0,
      idleDurationSeconds: 0,
      distractionDurationSeconds: 0,
    };
  }

  const intervals = normalizeToIntervals(eventsOrSegments, sessionStartMs, sessionEndMs);

  // Active intervals exclude AFK break segments
  const activeIntervals = intervals.filter((i) => i.category !== "break");

  const activeDurationSeconds = activeIntervals.reduce((sum, i) => sum + i.durationSeconds, 0);
  const productiveDurationSeconds = activeIntervals
    .filter((i) => i.category === "focused")
    .reduce((sum, i) => sum + i.durationSeconds, 0);
  const distractionDurationSeconds = activeIntervals
    .filter((i) => i.category === "leisure")
    .reduce((sum, i) => sum + i.durationSeconds, 0);

  // Idle duration is total elapsed session duration minus non-idle active work
  const idleDurationSeconds = Math.max(0, durationSeconds - activeDurationSeconds);

  // Context counts & transitions
  const uniqueContexts = new Set(activeIntervals.map((i) => i.context));
  const contextCount = uniqueContexts.size;

  let contextSwitchCount = 0;
  for (let i = 1; i < activeIntervals.length; i++) {
    if (activeIntervals[i]!.context !== activeIntervals[i - 1]!.context) {
      contextSwitchCount++;
    }
  }

  const contextSwitchesPerHour =
    durationSeconds > 0 ? Number(((contextSwitchCount / durationSeconds) * 3600).toFixed(2)) : 0;

  return {
    durationSeconds,
    activeDurationSeconds,
    contextCount,
    contextSwitchCount,
    contextSwitchesPerHour,
    productiveDurationSeconds,
    idleDurationSeconds,
    distractionDurationSeconds,
  };
}
