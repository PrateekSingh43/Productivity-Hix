/**
 * Prisma-backed PatternDataProvider.
 *
 * Mirrors the API `readData` loading logic (same tables, same window
 * semantics, same serialization shapes) without importing from apps/api.
 * This file is the documented seam: a future DailyFeatureSnapshot /
 * analytical projection replaces this implementation, not the worker.
 */
import { getDb } from "@repo/db";
import {
  assembleEvidence,
  countDistinctCalendarDays,
  subtractCalendarDays,
  type OutcomeInput,
  type PatternPipelineInput,
} from "@repo/analytics";
import { resolveProductiveDay, type CheckIn, type NormalizedActivityEvent, type WorkSession } from "@repo/types";
import type { PatternAnalysisJobData } from "@repo/types";
import type { PatternDataProvider, SourceWatermarks } from "./data-provider";

type Database = ReturnType<typeof getDb>;

function serializeEvent(row: {
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
  const mapped = watcherMap[row.watcher] ?? (["window", "web", "afk", "input"].includes(row.watcher)
    ? (row.watcher as NormalizedActivityEvent["watcher"]) : "unknown");
  return {
    externalId: row.externalId,
    bucketId: row.bucketId,
    source: row.source === "desktop" || row.source === "browser" ? row.source : "unknown",
    watcher: mapped,
    timestamp: row.timestamp.toISOString(),
    duration: row.duration,
    data: row.data && typeof row.data === "object" && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>) : {},
  };
}

function serializeSession(row: {
  id: string; userId: string; taskId: string | null;
  startedAt: Date; endedAt: Date | null;
  durationSeconds: number | null; targetDurationMinutes?: number | null;
  isPaused?: boolean | null; pausedAt?: Date | null; lastResumedAt?: Date | null;
  source: string; notes?: string | null; createdAt?: Date | null;
}): WorkSession {
  let effectiveStart = row.startedAt;
  if (row.createdAt && row.startedAt.getTime() > row.createdAt.getTime() + 5000) {
    effectiveStart = row.createdAt;
  }
  if (row.endedAt && row.durationSeconds) {
    const wallClockSec = Math.round((row.endedAt.getTime() - effectiveStart.getTime()) / 1000);
    if (wallClockSec < row.durationSeconds) {
      effectiveStart = new Date(Math.min(effectiveStart.getTime(), row.endedAt.getTime() - row.durationSeconds * 1000));
    }
  }
  return {
    id: row.id,
    userId: row.userId,
    taskId: row.taskId,
    startedAt: effectiveStart.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds ?? 0,
    targetDurationMinutes: row.targetDurationMinutes ?? null,
    isPaused: Boolean(row.isPaused),
    pausedAt: row.pausedAt?.toISOString() ?? null,
    lastResumedAt: row.lastResumedAt?.toISOString() ?? null,
    source: row.source === "derived" ? "derived" : "manual",
    notes: row.notes ?? null,
  };
}

function serializeCheckIn(row: {
  id: string; userId: string; workSessionId: string | null; taskId: string | null;
  windowStart: Date | null; windowEnd: Date | null;
  activityAssessment: string | null; alignment: string | null; reasons: string[];
  state: string | null; energy: string | null; focus: string | null; note: string | null;
  questionVersion: string; source: string; deeperAnswers: unknown;
  intent: string | null; progress: boolean | null; blocker: string | null;
  productive: boolean | null; outcome: string | null; createdAt: Date;
}): CheckIn {
  return {
    id: row.id,
    userId: row.userId,
    workSessionId: row.workSessionId,
    taskId: row.taskId,
    windowStart: row.windowStart ? row.windowStart.toISOString() : null,
    windowEnd: row.windowEnd ? row.windowEnd.toISOString() : null,
    activityAssessment: row.activityAssessment,
    alignment: row.alignment,
    reasons: row.reasons ?? [],
    state: row.state,
    energy: row.energy,
    focus: row.focus,
    note: row.note,
    questionVersion: row.questionVersion,
    source: row.source,
    deeperAnswers: row.deeperAnswers && typeof row.deeperAnswers === "object"
      ? (row.deeperAnswers as Record<string, string>) : null,
    intent: row.intent,
    progress: row.progress,
    blocker: row.blocker,
    productive: row.productive,
    outcome: row.outcome,
    createdAt: row.createdAt.toISOString(),
  };
}

async function readRecordingHistory(db: Database, userId: string, timezone: string) {
  const rows = typeof (db as { $queryRaw?: unknown }).$queryRaw === "function"
    ? await (db as unknown as {
      $queryRaw: (s: TemplateStringsArray, ...v: unknown[]) => Promise<Array<{ min_time: Date | null; max_time: Date | null; distinct_days: bigint }>>;
    }).$queryRaw`
      SELECT MIN("timestamp") AS min_time, MAX("timestamp") AS max_time,
        COUNT(DISTINCT DATE("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})) AS distinct_days
      FROM "normalized_activity"
      WHERE "user_id" = ${userId}
    ` : undefined;
  if (rows?.[0]) {
    return {
      firstObservationAt: rows[0].min_time?.toISOString() ?? null,
      lastObservationAt: rows[0].max_time?.toISOString() ?? null,
      recordedDays: Number(rows[0].distinct_days),
    };
  }
  const events = await db.normalizedActivity.findMany({ where: { userId }, select: { timestamp: true } });
  const timestamps = events.map((e) => e.timestamp.toISOString()).sort();
  return {
    firstObservationAt: timestamps[0] ?? null,
    lastObservationAt: timestamps[timestamps.length - 1] ?? null,
    recordedDays: countDistinctCalendarDays(timestamps, timezone),
  };
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export class PrismaPatternDataProvider implements PatternDataProvider {
  constructor(private readonly db: Database = getDb()) {}

  async loadInput(data: PatternAnalysisJobData): Promise<PatternPipelineInput> {
    const { userId } = data;
    const window = { start: data.windowStart, end: data.windowEnd };
    const db = this.db;
    const preferences = await db.userPreference.findUnique({ where: { userId } });
    const timezone = preferences?.timezone ?? "UTC";
    const baselineWindow = { start: subtractCalendarDays(window.start, 30, timezone), end: window.start };
    const from = new Date(baselineWindow.start);
    const to = new Date(window.end);

    const [activityRows, sessionRows, checkInRows, taskRows, goals, activityCount, history, desktopCount, browserCount] = await Promise.all([
      db.normalizedActivity.findMany({
        where: { userId, timestamp: { gte: from, lt: to }, duration: { gt: 0 } },
        orderBy: [{ timestamp: "asc" }, { id: "asc" }],
      }),
      db.workSession.findMany({
        where: { userId, startedAt: { lt: to }, OR: [{ endedAt: { gt: from } }, { endedAt: null }] },
        orderBy: [{ startedAt: "desc" }, { id: "asc" }],
      }),
      db.checkIn.findMany({
        where: {
          userId,
          OR: [
            { windowStart: { lt: to }, windowEnd: { gt: from } },
            { windowStart: null, createdAt: { gte: from, lt: to } },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      }),
      db.task.findMany({ where: { userId }, select: { id: true, completedAt: true } }),
      db.dailyGoal.findMany({
        where: { userId, plan: { date: { gte: resolveProductiveDay(window.start, { timezone }), lte: resolveProductiveDay(window.end, { timezone }) } } },
        select: { id: true, outcome: true, plan: { select: { date: true } } },
      }),
      db.normalizedActivity.count({ where: { userId } }),
      readRecordingHistory(db, userId, timezone),
      db.desktopDevice.count({ where: { userId } }),
      db.browserInstallation.count({ where: { userId } }),
    ]);

    const events = activityRows.flatMap((row) => {
      const timestamp = row.timestamp.getTime();
      const duration = row.duration;
      if (!Number.isFinite(timestamp) || !Number.isFinite(duration) || duration <= 0) return [];
      const start = Math.max(from.getTime(), timestamp);
      const end = Math.min(to.getTime(), timestamp + duration * 1000);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
      return [serializeEvent({ ...row, timestamp: new Date(start), duration: (end - start) / 1000 })];
    });
    const sessions = sessionRows.map((s) => serializeSession(s)).sort((a, b) => compare(a.startedAt, b.startedAt) || compare(a.id, b.id));
    const reports = checkInRows.map((r) => serializeCheckIn(r)).sort((a, b) => compare(a.id, b.id));
    const tasks = [...taskRows].sort((a, b) => compare(a.id, b.id));
    const outcomes: OutcomeInput[] = goals.flatMap<OutcomeInput>((goal) => {
      const outcome = goal.outcome;
      return outcome === "ACHIEVED" || outcome === "PARTIALLY_ACHIEVED" || outcome === "NOT_ACHIEVED"
        ? [{ recordId: goal.id, date: goal.plan.date, goalOutcome: outcome }] : [];
    }).sort((a, b) => compare(a.recordId, b.recordId));

    return {
      userId, timezone, boundary: preferences?.dayBoundary ?? "00:00", window, baselineWindow,
      sessions, reports, outcomes,
      tasks: tasks.map((t) => ({ id: t.id, completedAt: t.completedAt?.toISOString() ?? null })),
      timeline: assembleEvidence(userId, window, events, sessions, reports),
      baseline: assembleEvidence(userId, baselineWindow, events, sessions, reports),
      connected: desktopCount + browserCount + activityCount > 0,
      recordingHistory: { ...history, connected: desktopCount + browserCount > 0 },
    };
  }

  async readWatermarks(data: PatternAnalysisJobData): Promise<SourceWatermarks> {
    const { userId } = data;
    const from = new Date(subtractCalendarDays(data.windowStart, 30, "UTC"));
    const to = new Date(data.windowEnd);
    const [activity, sessions, checkIns, tasks] = await Promise.all([
      this.db.normalizedActivity.findMany({
        where: { userId, timestamp: { gte: from, lt: to } },
        select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1,
      }),
      this.db.workSession.findMany({
        where: { userId, startedAt: { lt: to } },
        select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1,
      }),
      this.db.checkIn.findMany({
        where: { userId, createdAt: { gte: from, lt: to } },
        select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1,
      }),
      this.db.task.findMany({
        where: { userId },
        select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1,
      }),
    ]);
    const stamps = [
      activity[0]?.createdAt?.toISOString(),
      sessions[0]?.createdAt?.toISOString(),
      checkIns[0]?.createdAt?.toISOString(),
      tasks[0]?.updatedAt?.toISOString(),
    ].filter((s): s is string => Boolean(s)).sort();
    return { maxSourceAt: stamps[stamps.length - 1] ?? "1970-01-01T00:00:00.000Z" };
  }
}
