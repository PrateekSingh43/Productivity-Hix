import type { ActivitySummary, NormalizedActivityEvent } from "@repo/types";
import { isCodingActivity, isIdleActivity } from "./categories";

export function summarizeActivity(events: NormalizedActivityEvent[]): ActivitySummary {
  let activeTime = 0;
  let idleTime = 0;
  let codingTime = 0;
  let browserTime = 0;
  let applicationTime = 0;

  for (const event of events) {
    const seconds = Math.max(0, event.duration);
    if (isIdleActivity(event)) {
      idleTime += seconds;
      continue;
    }
    activeTime += seconds;
    if (event.source === "browser" || event.watcher === "web") browserTime += seconds;
    if (event.watcher === "window") applicationTime += seconds;
    if (isCodingActivity(event)) codingTime += seconds;
  }

  return {
    activeTime,
    idleTime,
    codingTime,
    browserTime,
    applicationTime,
    sessions: countActiveRuns(events),
  };
}

function countActiveRuns(events: NormalizedActivityEvent[]) {
  return events
    .filter((event) => !isIdleActivity(event))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .reduce<{ count: number; lastEnd: number }>(
      (result, event) => {
        const start = Date.parse(event.timestamp);
        const end = start + event.duration * 1000;
        if (start - result.lastEnd > 5 * 60 * 1000) result.count += 1;
        result.lastEnd = Math.max(result.lastEnd, end);
        return result;
      },
      { count: 0, lastEnd: 0 },
    ).count;
}
