import type { NormalizedActivityEvent, ProductivityPattern } from "@repo/types";
import { isIdleActivity } from "../activity/categories";

export function productivityPatterns(events: NormalizedActivityEvent[], timeZone = "UTC") {
  const groups = new Map<string, ProductivityPattern>();
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hour12: false });
  for (const event of events) {
    if (isIdleActivity(event)) continue;
    const key = formatter.format(new Date(event.timestamp));
    const existing = groups.get(key) ?? {
      dimension: "hour",
      key,
      sessions: 0,
      completedTasks: 0,
      activeSeconds: 0,
    };
    existing.sessions += 1;
    existing.activeSeconds += event.duration;
    groups.set(key, existing);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
