import type {
  TimelineResponse,
  CurrentActivityState,
  TimelineSummary,
} from "@repo/types";
import {
  aggregateActivitySegments,
  computeTimelineSummary,
  normalizeAppName,
  cleanWindowTitle,
  categorizeActivity,
} from "@repo/analytics";
import { getDb } from "../../lib/prisma";

export { normalizeAppName, cleanWindowTitle, categorizeActivity };

/**
 * Accurately calculate day boundaries in the target timezone
 */
export function getDayBoundaries(dateStr: string, timezone: string): { startOfDay: Date; endOfDay: Date } {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0] ?? new Date().getFullYear();
  const month = (parts[1] ?? 1) - 1;
  const day = parts[2] ?? new Date().getDate();

  const approxUtc = new Date(Date.UTC(year, month, day, 0, 0, 0));

  try {
    const invDate = new Date(approxUtc.toLocaleString("en-US", { timeZone: timezone }));
    const diffMs = approxUtc.getTime() - invDate.getTime();

    const startOfDay = new Date(approxUtc.getTime() + diffMs);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

    return { startOfDay, endOfDay };
  } catch {
    const startOfDay = new Date(Date.UTC(year, month, day, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    return { startOfDay, endOfDay };
  }
}

export async function getTimelineForDay(
  userId: string,
  dateStr?: string,
  requestedTimezone?: string,
): Promise<TimelineResponse> {
  const timezone = requestedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const effectiveDateStr = dateStr || new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

  const { startOfDay, endOfDay } = getDayBoundaries(effectiveDateStr, timezone);

  const prisma = getDb();
  const rawRows = await prisma.normalizedActivity.findMany({
    where: {
      userId,
      timestamp: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    orderBy: { timestamp: "asc" },
  });

  if (rawRows.length === 0) {
    const emptySummary: TimelineSummary = {
      totalTrackedMs: 0,
      focusedMs: 0,
      browserMs: 0,
      leisureMs: 0,
      breakMs: 0,
      communicationMs: 0,
      generalMs: 0,
      segmentsCount: 0,
    };
    return {
      date: effectiveDateStr,
      timezone,
      totalDurationMs: 0,
      summary: emptySummary,
      currentActivity: null,
      segments: [],
    };
  }

  // Aggregate into continuous human-scale TimelineSegments
  const segments = aggregateActivitySegments(rawRows, {
    maxGapMs: 120_000,
    minBreakMs: 60_000,
    transientThresholdMs: 15_000,
  });

  // Calculate mathematically consistent summary
  const summary = computeTimelineSummary(segments);

  // Compute live current activity state
  const todayStr = new Date().toLocaleDateString("en-CA");
  let currentActivity: CurrentActivityState | null = null;

  if (effectiveDateStr === todayStr) {
    const latestRow = await prisma.normalizedActivity.findFirst({
      where: { userId },
      orderBy: { timestamp: "desc" },
    });

    if (latestRow) {
      const data = (latestRow.data ?? {}) as Record<string, any>;
      const ageSeconds = Math.round((Date.now() - latestRow.timestamp.getTime()) / 1000);
      const isAfk = latestRow.watcher === "afk" && (data.state === "afk" || data.status === "afk");
      const appName = isAfk ? "Away from Keyboard" : normalizeAppName(data.application || data.app, data);
      const title = cleanWindowTitle(data.windowTitle || data.pageTitle || data.title, appName);
      const category = categorizeActivity(appName, title, isAfk, latestRow.source === "browser");

      currentActivity = {
        isActive: ageSeconds < 300 && !isAfk,
        application: appName,
        title: title || (isAfk ? "Away from keyboard" : "Active Window"),
        domain: data.domain || null,
        startedAt: latestRow.timestamp.toISOString(),
        runningForSeconds: ageSeconds,
        category,
        isAfk,
      };
    }
  }

  return {
    date: effectiveDateStr,
    timezone,
    totalDurationMs: summary.totalTrackedMs,
    summary,
    currentActivity,
    segments,
  };
}
