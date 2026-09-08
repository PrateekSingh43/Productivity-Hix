import type { NormalizedActivityEvent, WorkSession } from "@repo/types";
import { isIdleActivity } from "./categories";

type SanitizedEvent = {
  externalId: string;
  start: number;
  end: number;
  durationSec: number;
};

export function deriveSessions(events: NormalizedActivityEvent[], gapSeconds = 300): WorkSession[] {
  const active: SanitizedEvent[] = [];

  for (const event of events) {
    if (isIdleActivity(event)) continue;

    const durationSec = event.duration;
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      continue;
    }

    const start = Date.parse(event.timestamp);
    if (Number.isNaN(start)) continue;

    const end = start + Math.round(durationSec * 1000);
    active.push({
      externalId: event.externalId ?? "",
      start,
      end,
      durationSec,
    });
  }

  if (active.length === 0) return [];

  // Deterministic sort: start ASC, duration DESC, externalId ASC
  active.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.durationSec !== b.durationSec) return b.durationSec - a.durationSec;
    return a.externalId.localeCompare(b.externalId);
  });

  const sessions: WorkSession[] = [];

  for (const event of active) {
    const current = sessions.at(-1);

    if (!current) {
      sessions.push({
        id: `derived-${sessions.length + 1}`,
        taskId: null,
        startedAt: new Date(event.start).toISOString(),
        endedAt: new Date(event.end).toISOString(),
        durationSeconds: Math.round((event.end - event.start) / 1000),
        source: "derived",
        notes: null,
      });
      continue;
    }

    const currentEnd = Date.parse(current.endedAt ?? current.startedAt);

    if (event.start - currentEnd <= gapSeconds * 1000) {
      const newEnd = Math.max(currentEnd, event.end);
      current.endedAt = new Date(newEnd).toISOString();
      current.durationSeconds = Math.round((newEnd - Date.parse(current.startedAt)) / 1000);
    } else {
      sessions.push({
        id: `derived-${sessions.length + 1}`,
        taskId: null,
        startedAt: new Date(event.start).toISOString(),
        endedAt: new Date(event.end).toISOString(),
        durationSeconds: Math.round((event.end - event.start) / 1000),
        source: "derived",
        notes: null,
      });
    }
  }

  return sessions;
}

