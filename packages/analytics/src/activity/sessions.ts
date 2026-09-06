import type { NormalizedActivityEvent, WorkSession } from "@repo/types";
import { isIdleActivity } from "./categories";

export function deriveSessions(events: NormalizedActivityEvent[], gapSeconds = 300): WorkSession[] {
  const active = events
    .filter((event) => !isIdleActivity(event))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const sessions: WorkSession[] = [];

  for (const event of active) {
    const start = Date.parse(event.timestamp);
    const end = start + event.duration * 1000;
    const current = sessions.at(-1);
    if (!current || start - Date.parse(current.endedAt ?? current.startedAt) > gapSeconds * 1000) {
      sessions.push({
        id: `derived-${sessions.length + 1}`,
        taskId: null,
        startedAt: new Date(start).toISOString(),
        endedAt: new Date(end).toISOString(),
        durationSeconds: event.duration,
        source: "derived",
        notes: null,
      });
      continue;
    }
    const currentEnd = Date.parse(current.endedAt ?? current.startedAt);
    current.endedAt = new Date(Math.max(currentEnd, end)).toISOString();
    current.durationSeconds = (Date.parse(current.endedAt) - Date.parse(current.startedAt)) / 1000;
  }

  return sessions;
}
