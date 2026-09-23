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
import type { TimelineBlock } from "@repo/types";

export type TimelineBlockPayload = TimelineBlock;

function toTimelineBlockPayload(
  block: { id: string; [key: string]: unknown },
  claims: Array<{
    claimType: string;
    value: string;
    confidence: number | null;
    provenance: string;
    authority?: string;
    evidence?: Array<{ evidenceType: string; evidenceReference: string; weight: number }>;
  }>,
  attention: { focusEvidenceState: string } | null,
  intentLink: {
    targetScope: string;
    taskId: string | null;
    goalId: string | null;
    projectTag: string | null;
    relevance: string;
    intentionRelationship: string;
  } | null = null
): TimelineBlockPayload {
  const primary = claims.find((c) => c.claimType === "MODALITY_PRIMARY") ?? null;
  const secondary = claims.filter((c) => c.claimType === "MODALITY_SECONDARY");
  const context = claims.find((c) => c.claimType === "TOPIC_CONTEXT") ?? null;
  const behavior = claims.find((c) => c.claimType === "INFERRED_BEHAVIOR") ?? null;
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
    activityType: behavior?.value ?? null,
    modality: {
      primary: primary
        ? {
            value: primary.value,
            confidence: primary.confidence,
            provenance: primary.provenance,
            authority: primary.authority ?? "SYSTEM",
            evidence: primary.evidence,
          }
        : null,
      secondary: secondary.map((c) => ({
        value: c.value,
        provenance: c.provenance,
        authority: c.authority,
        evidence: c.evidence,
      })),
      context: context
        ? {
            value: context.value,
            provenance: context.provenance,
            authority: context.authority,
            evidence: context.evidence,
          }
        : null,
    },
    intentLink: intentLink
      ? {
          targetScope: intentLink.targetScope,
          taskId: intentLink.taskId,
          goalId: intentLink.goalId,
          projectTag: intentLink.projectTag,
          relevance: intentLink.relevance,
          intentionRelationship: intentLink.intentionRelationship,
        }
      : null,
    attention,
    coverageGaps: [],
    pendingInterpretation: !primary,
  };
}

export { normalizeAppName, cleanWindowTitle, categorizeActivity };

import { resolveLocalDayInterval } from "@repo/types";

/**
 * Accurately calculate day boundaries in the target timezone using canonical local-day interval resolver.
 */
export function getDayBoundaries(dateStr: string, timezone: string): { startOfDay: Date; endOfDay: Date } {
  const iv = resolveLocalDayInterval(dateStr, { timezone });
  return { startOfDay: iv.start, endOfDay: iv.end };
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

  // Aggregate into continuous human-scale TimelineSegments
  // Invariant: quietHours is user notification context only, NOT machine sleep or slacking.
  // Do not conflate quietHours with sleep detection.
  const segments = aggregateActivitySegments(rawRows, {
    maxGapMs: 120_000,
    minBreakMs: 60_000,
    transientThresholdMs: 15_000,
    maxBreakMs: 2 * 60 * 60 * 1000, // 2 hours: extended absence must never accumulate as active work break
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

  // 1. Fast Path: Read authoritative durable snapshot if available (<10ms)
  const dayState = typeof prisma.timelineDayState?.findUnique === "function"
    ? await prisma.timelineDayState.findUnique({
        where: { userId_localDate: { userId, localDate: effectiveDateStr } },
        include: { activeSnapshot: true },
      })
    : null;

  if (dayState?.activeSnapshot && dayState.activeSnapshot.status === "COMPLETE") {
    const snap = dayState.activeSnapshot;
    const blocks = (snap.blocksJson ?? []) as unknown as TimelineBlockPayload[];
    const summary = (snap.summary ?? {}) as unknown as TimelineSummary;

    return {
      date: effectiveDateStr,
      timezone,
      totalDurationMs: summary.totalTrackedMs || 0,
      summary,
      currentActivity,
      segments: [],
      blocks,
    };
  }

  // 2. Fallback Path: Query existing blocks from DB or materialize only if in test environment
  let blocks: TimelineBlockPayload[] = [];
  try {
    if (process.env.NODE_ENV === "test") {
      // In isolated unit tests where worker daemon is not running, allow synchronous materialization
      await materializeBlocksForUserDay(getDb(), userId, startOfDay, endOfDay, {
        maxGapMs: 120_000,
        minBreakMs: 60_000,
        transientThresholdMs: 15_000,
        maxBreakMs: 2 * 60 * 60 * 1000,
      });
    }

    const blockRows = await prisma.temporalActivityBlock.findMany({
      where: { userId, startTime: { gte: startOfDay, lte: endOfDay }, track: "FOREGROUND" },
      orderBy: { startTime: "asc" },
      include: {
        claims: {
          where: { isCurrent: true },
          select: {
            claimType: true,
            value: true,
            confidence: true,
            provenance: true,
            authority: true,
            evidence: {
              select: {
                evidenceType: true,
                evidenceReference: true,
                weight: true,
              },
            },
          },
        },
        attentionInferences: { select: { focusEvidenceState: true } },
        contextLinks: {
          select: {
            targetScope: true,
            taskId: true,
            goalId: true,
            projectTag: true,
            relevance: true,
            intentionRelationship: true,
          },
        },
      },
    });

    blocks = blockRows.map((row) =>
      toTimelineBlockPayload(
        row as unknown as { id: string; [key: string]: unknown },
        row.claims as any,
        row.attentionInferences[0] ? { focusEvidenceState: row.attentionInferences[0]!.focusEvidenceState } : null,
        row.contextLinks[0] ?? null
      )
    );
  } catch (materializeError) {
    console.error("[Timeline] Block query/materialization failed, returning legacy timeline only:", materializeError);
  }

  // Compute canonical semantic breakdowns from blocks
  let developmentMs = 0;
  let readingResearchMs = 0;
  let writingDocumentationMs = 0;
  let communicationModalityMs = 0;
  let mediaConsumptionMs = 0;
  let gamingMs = 0;
  let idleAwayMs = 0;
  let administrationMs = 0;
  let unknownMs = 0;

  for (const b of blocks) {
    const mod = b.modality.primary?.value ?? "unknown";
    const dur = b.wallClockDurationMs;
    switch (mod) {
      case "development":
        developmentMs += dur;
        break;
      case "reading_research":
        readingResearchMs += dur;
        break;
      case "writing_documentation":
        writingDocumentationMs += dur;
        break;
      case "communication":
        communicationModalityMs += dur;
        break;
      case "media_consumption":
        mediaConsumptionMs += dur;
        break;
      case "gaming":
        gamingMs += dur;
        break;
      case "idle_away":
        idleAwayMs += dur;
        break;
      case "administration":
      case "system_maintenance":
        administrationMs += dur;
        break;
      default:
        unknownMs += dur;
        break;
    }
  }

  const enrichedSummary: TimelineSummary = {
    ...summary,
    developmentMs,
    readingResearchMs,
    writingDocumentationMs,
    communicationModalityMs,
    mediaConsumptionMs,
    gamingMs,
    idleAwayMs,
    administrationMs,
    unknownMs,
    blocksCount: blocks.length,
  };

  return {
    date: effectiveDateStr,
    timezone,
    totalDurationMs: summary.totalTrackedMs,
    summary: enrichedSummary,
    currentActivity,
    segments,
    blocks,
  };
}
