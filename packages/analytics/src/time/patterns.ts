import type { NormalizedActivityEvent } from "@repo/types";
import { isIdleActivity } from "../activity/categories";

export function timeOfDaySeconds(events: NormalizedActivityEvent[], timeZone = "UTC") {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hour12: false });
  const totals = new Map<string, number>();
  for (const event of events) {
    if (isIdleActivity(event)) continue;
    const hour = formatter.format(new Date(event.timestamp));
    totals.set(hour, (totals.get(hour) ?? 0) + event.duration);
  }
  return Object.fromEntries([...totals.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
