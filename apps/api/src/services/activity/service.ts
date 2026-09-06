import type { ActivitySummary, NormalizedActivityEvent } from "@repo/types";
import { summarizeActivity } from "@repo/analytics";
import { getDb } from "../../lib/prisma";

function serialize(row: {
  externalId: string;
  bucketId: string;
  source: string;
  watcher: string;
  timestamp: Date;
  duration: number;
  data: unknown;
}): NormalizedActivityEvent {
  const watcherMap: Record<string, NormalizedActivityEvent["watcher"]> = {
    active_window: "window",
    window: "window",
    active_tab: "web",
    web: "web",
    tab_switch: "web",
    browser_idle: "afk",
    afk: "afk",
    input: "input",
  };

  const mappedWatcher = watcherMap[row.watcher] ?? (["window", "web", "afk", "input"].includes(row.watcher) ? (row.watcher as NormalizedActivityEvent["watcher"]) : "unknown");

  return {
    externalId: row.externalId,
    bucketId: row.bucketId,
    source: row.source === "desktop" || row.source === "browser" ? row.source : "unknown",
    watcher: mappedWatcher,
    timestamp: row.timestamp.toISOString(),
    duration: row.duration,
    data:
      row.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : {},
  };
}

export async function activityInRange(userId: string, from: Date, to: Date) {
  const rows = await getDb().normalizedActivity.findMany({
    where: { userId, timestamp: { gte: from, lt: to } },
    orderBy: { timestamp: "asc" },
  });
  return rows.map(serialize);
}

export async function activitySummary(
  userId: string,
  from: Date,
  to: Date,
): Promise<ActivitySummary> {
  return summarizeActivity(await activityInRange(userId, from, to));
}

export async function syncActivity(userId: string) {
  // Queries latest synchronized activity count and devices
  const count = await getDb().normalizedActivity.count({
    where: { userId },
  });
  const devices = await getDb().desktopDevice.findMany({
    where: { userId },
    select: { id: true, name: true, platform: true, lastActiveAt: true },
  });

  return {
    syncedEventsCount: count,
    devices,
  };
}

export function utcDayRange(date = new Date()) {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

export { getTimelineForDay } from "./timeline";
