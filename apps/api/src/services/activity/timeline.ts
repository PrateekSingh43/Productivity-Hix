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
import { materializeBlocksForUserDay } from "./blocks";

export interface TimelineBlockPayload {
  id: string;
  startTime: string;
  endTime: string;
  wallClockDurationMs: number;
  observedActiveDurationMs: number;
  pausedDurationMs: number;
  track: string;
  primaryApplication: string;
  cleanTitle: string;
  domain: string | null;
  sanitizedUrl: string | null;
  sourceChannel: string;
  rawEventCount: number;
  observationSetFingerprint: string;
  isAfkBlock: boolean;
  modality: {
    primary: { value: string; confidence: number | null; provenance: string; authority: string } | null;
    secondary: Array<{ value: string; provenance: string }>;
    context: { value: string; provenance: string } | null;
  };
  attention: { focusEvidenceState: string } | null;
  coverageGaps: Array<{ id: string; startTime: string; endTime: string; coverageState: string; reconciliationState: string }>;
  pendingInterpretation: boolean;
}

function toTimelineBlockPayload(
  block: { id: string; [key: string]: unknown },
  claims: Array<{ claimType: string; value: string; confidence: number | null; provenance: string }>,
  attention: { focusEvidenceState: string } | null
): TimelineBlockPayload {
  const primary = claims.find((c) => c.claimType === "MODALITY_PRIMARY") ?? null;
  const secondary = claims.filter((c) => c.claimType === "MODALITY_SECONDARY");
  const context = claims.find((c) => c.claimType === "TOPIC_CONTEXT") ?? null;
  return {
    id: block.id,
    startTime: (block.startTime as Date).toISOString(),
    endTime: (block.endTime as Date).toISOString(),
    wallClockDurationMs: block.wallClockDurationMs as number,
    observedActiveDurationMs: block.observedActiveDurationMs as number,
    pausedDurationMs: block.pausedDurationMs as number,
    track: block.track as string,
    primaryApplication: block.primaryApplication as string,
    cleanTitle: block.cleanTitle as string,
    domain: (block.domain as string | null) ?? null,
    sanitizedUrl: (block.sanitizedUrl as string | null) ?? null,
    sourceChannel: block.sourceChannel as string,
    rawEventCount: block.rawEventCount as number,
    observationSetFingerprint: block.observationSetFingerprint as string,
    isAfkBlock: (block.track as string) === "FOREGROUND" && (block.primaryApplication as string) === "afk",
    modality: {
      primary: primary
        ? { value: primary.value, confidence: primary.confidence, provenance: primary.provenance, authority: "SYSTEM" }
        : null,
      secondary: secondary.map((c) => ({ value: c.value, provenance: c.provenance })),
      context: context ? { value: context.value, provenance: context.provenance } : null,
    },
    attention,
    coverageGaps: [],
    pendingInterpretation: !primary,
  };
}

export { normalizeAppName, cleanWindowTitle, categorizeActivity };

/**
 * Accurately calculate day boundaries in the target timezone
 */
export function getDayBoundaries(dateStr: string, timezone: string): { startOfDay: Date; endOfDay: Date } {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0] ?? new Date().getFullYear();
  const month = (parts[1] ?? 1) - 1;
  const day = parts[2] ?? new Date().getDate();

  try {
    const candidateUtc = new Date(Date.UTC(year, month, day, 0, 0, 0));
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });
    const formattedParts = formatter.formatToParts(candidateUtc);
    const getPart = (type: string) => parseInt(formattedParts.find((p) => p.type === type)?.value || "0", 10);
    const tzHour = getPart("hour") === 24 ? 0 : getPart("hour");
    const tzUtcEquiv = new Date(Date.UTC(
      getPart("year"),
      getPart("month") - 1,
      getPart("day"),
      tzHour,
      getPart("minute"),
      getPart("second"),
    ));
    const offsetMs = tzUtcEquiv.getTime() - candidateUtc.getTime();

    const startOfDay = new Date(candidateUtc.getTime() - offsetMs);
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
  const prisma = getDb();
  const userPref = await prisma.userPreference.findUnique({
    where: { userId },
    select: {
      timezone: true,
      quietHoursEnabled: true,
      quietHoursStart: true,
      quietHoursEnd: true,
    },
  });

  const timezone = requestedTimezone || userPref?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const effectiveDateStr = dateStr || new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

  const { startOfDay, endOfDay } = getDayBoundaries(effectiveDateStr, timezone);

  const rawRows = await prisma.normalizedActivity.findMany({
    where: {
      userId,
      timestamp: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    select: {
      id: true,
      externalId: true,
      timestamp: true,
      duration: true,
      source: true,
      watcher: true,
      data: true,
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
      blocks: [],
    };
  }

  const sleepWindow =
    userPref?.quietHoursEnabled && userPref?.quietHoursStart && userPref?.quietHoursEnd
      ? {
          start: userPref.quietHoursStart,
          end: userPref.quietHoursEnd,
          timezone,
        }
      : undefined;

  // Aggregate into continuous human-scale TimelineSegments
  const segments = aggregateActivitySegments(rawRows, {
    maxGapMs: 120_000,
    minBreakMs: 60_000,
    transientThresholdMs: 15_000,
    maxBreakMs: 2 * 60 * 60 * 1000, // 2 hours: sleep / extended absence must never accumulate as active work break
    sleepWindow,
  });

  // Calculate mathematically consistent summary
  const summary = computeTimelineSummary(segments);

  // Compute live current activity state
  const todayStr = new Date().toLocaleDateString("en-CA");
  let currentActivity: CurrentActivityState | null = null;

  if (effectiveDateStr === todayStr && rawRows.length > 0) {
    // Optimization: rawRows is sorted ascending by timestamp, so the last element is the latest event today
    const latestRow = rawRows[rawRows.length - 1]!;

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

  // Materialize Phase 3B semantic blocks (idempotent, fingerprint-backed)
  let blocks: TimelineBlockPayload[] = [];
  try {
    await materializeBlocksForUserDay(getDb(), userId, startOfDay, endOfDay, {
      maxGapMs: 120_000,
      minBreakMs: 60_000,
      transientThresholdMs: 15_000,
      maxBreakMs: 2 * 60 * 60 * 1000,
    });
    const blockRows = await prisma.temporalActivityBlock.findMany({
      where: { userId, startTime: { gte: startOfDay, lte: endOfDay }, track: "FOREGROUND" },
      orderBy: { startTime: "asc" },
      include: {
        claims: { where: { isCurrent: true }, select: { claimType: true, value: true, confidence: true, provenance: true } },
        attentionInferences: { select: { focusEvidenceState: true } },
      },
    });
    blocks = blockRows.map((row) =>
      toTimelineBlockPayload(
        row as unknown as { id: string; [key: string]: unknown },
        row.claims as Array<{ claimType: string; value: string; confidence: number | null; provenance: string }>,
        row.attentionInferences[0] ? { focusEvidenceState: row.attentionInferences[0]!.focusEvidenceState } : null
      )
    );
  } catch (materializeError) {
    console.error("[Timeline] Block materialization failed, returning legacy timeline only:", materializeError);
  }

  return {
    date: effectiveDateStr,
    timezone,
    totalDurationMs: summary.totalTrackedMs,
    summary,
    currentActivity,
    segments,
    blocks,
  };
}
