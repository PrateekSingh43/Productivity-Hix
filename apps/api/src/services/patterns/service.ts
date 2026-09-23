import type {
  AnalyticalWindow, BehavioralPatternOutput, CheckIn, EvidenceTimeline, WorkSession,
} from "@repo/types";
import { resolveProductiveDay } from "@repo/types";
import {
  composeInsights,
  countDistinctCalendarDays,
  evaluatePatterns,
  subtractCalendarDays,
  type DetectorDiagnostics,
  type OutcomeInput,
  type PatternsState,
  type RecordingHistory,
  type ReflectionInput,
} from "@repo/analytics";
import { getDb } from "../../lib/prisma";
import { activityInRange } from "../activity/service";
import { listCheckIns } from "../check-ins/service";
import { listSessions } from "../sessions/service";
import { assembleEvidence, compare, overlaps } from "./evidence";

export type { DetectorDiagnostics, PatternsState, RecordingHistory };
export interface PatternsResponse {
  state: PatternsState;
  window: AnalyticalWindow;
  patterns: BehavioralPatternOutput[];
  diagnostics: { perDetector: DetectorDiagnostics[]; recordingHistory?: RecordingHistory };
}
export interface InsightsResponse {
  state: PatternsState;
  window: AnalyticalWindow;
  insights: import("@repo/types").InsightOutput[];
  diagnostics: PatternsResponse["diagnostics"];
}
export class BadRequest extends Error {
  readonly statusCode = 400;
}

export function resolveWindow(from?: unknown, to?: unknown, now = new Date()): AnalyticalWindow {
  const parse = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
      throw new BadRequest("from/to must be ISO dates or timestamps with a timezone.");
    }
    const ms = Date.parse(value);
    const day = value.slice(0, 10);
    if (!Number.isFinite(ms) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) {
      throw new BadRequest("Invalid from/to date.");
    }
    return ms;
  };
  const end = parse(to, now.getTime());
  const start = parse(from, end - 14 * 86400000);
  if (start >= end || end - start > 90 * 86400000) throw new BadRequest("The half-open window must be positive and at most 90 days.");
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

interface Data {
  userId: string;
  timezone: string;
  boundary: string;
  window: AnalyticalWindow;
  baselineWindow: AnalyticalWindow;
  timeline: EvidenceTimeline;
  baseline: EvidenceTimeline;
  sessions: WorkSession[];
  reports: CheckIn[];
  outcomes: OutcomeInput[];
  tasks: Array<{ id: string; completedAt: Date | null }>;
  connected: boolean;
  recordingHistory: RecordingHistory;
}

async function readRecordingHistory(userId: string, timezone: string): Promise<Omit<RecordingHistory, "connected">> {
  const db = getDb();
  const rows = typeof db.$queryRaw === "function" ? await db.$queryRaw<Array<{
    min_time: Date | null; max_time: Date | null; distinct_days: bigint;
  }>>`
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
  const timestamps = events.map((event) => event.timestamp.toISOString()).sort();
  return {
    firstObservationAt: timestamps[0] ?? null,
    lastObservationAt: timestamps[timestamps.length - 1] ?? null,
    recordedDays: countDistinctCalendarDays(timestamps, timezone),
  };
}

async function readData(userId: string, window: AnalyticalWindow): Promise<Data> {
  const db = getDb();
  const preferences = await db.userPreference.findUnique({ where: { userId } });
  const timezone = preferences?.timezone ?? "UTC";
  const baselineWindow = { start: subtractCalendarDays(window.start, 30, timezone), end: window.start };
  const range = { from: new Date(baselineWindow.start), to: new Date(window.end) };
  const [events, sessions, reports, tasks, goals, activityCount, recordingHistory, desktopCount, browserCount] = await Promise.all([
    activityInRange(userId, range.from, range.to), listSessions(userId, range), listCheckIns(userId, range),
    db.task.findMany({ where: { userId }, select: { id: true, completedAt: true } }),
    db.dailyGoal.findMany({ where: { userId, plan: { date: { gte: resolveProductiveDay(window.start, { timezone }), lte: resolveProductiveDay(window.end, { timezone }) } } },
      select: { id: true, outcome: true, plan: { select: { date: true } } } }),
    db.normalizedActivity.count({ where: { userId } }),
    readRecordingHistory(userId, timezone),
    db.desktopDevice.count({ where: { userId } }), db.browserInstallation.count({ where: { userId } }),
  ]);
  sessions.sort((a, b) => compare(a.startedAt, b.startedAt) || compare(a.id, b.id));
  reports.sort((a, b) => compare(a.id, b.id));
  tasks.sort((a, b) => compare(a.id, b.id));
  const outcomes: OutcomeInput[] = goals.flatMap<OutcomeInput>((goal) => {
    const outcome = goal.outcome;
    return outcome === "ACHIEVED" || outcome === "PARTIALLY_ACHIEVED" || outcome === "NOT_ACHIEVED"
      ? [{ recordId: goal.id, date: goal.plan.date, goalOutcome: outcome }] : [];
  }).sort((a, b) => compare(a.recordId, b.recordId));
  return {
    userId, timezone, boundary: preferences?.dayBoundary ?? "00:00", window, baselineWindow, sessions, reports, tasks, outcomes,
    timeline: assembleEvidence(userId, window, events, sessions, reports),
    baseline: assembleEvidence(userId, baselineWindow, events, sessions, reports),
    connected: desktopCount + browserCount + activityCount > 0,
    recordingHistory: { ...recordingHistory, connected: desktopCount + browserCount > 0 },
  };
}

export async function runPatternPipeline(userId: string, window: AnalyticalWindow): Promise<PatternsResponse> {
  const data = await readData(userId, window);
  return evaluatePatterns({
    ...data,
    tasks: data.tasks.map((task) => ({ id: task.id, completedAt: task.completedAt?.toISOString() ?? null })),
  });
}

export async function runInsightPipeline(userId: string, window: AnalyticalWindow): Promise<InsightsResponse> {
  const data = await readData(userId, window);
  const result = evaluatePatterns({
    ...data,
    tasks: data.tasks.map((task) => ({ id: task.id, completedAt: task.completedAt?.toISOString() ?? null })),
  });
  const reflections: ReflectionInput[] = data.reports.flatMap((report) => {
    if (!report.windowStart || !report.windowEnd || !overlaps(report.windowStart, report.windowEnd, window)) return [];
    const energy = report.energy;
    return [{ recordId: report.id, date: resolveProductiveDay(report.windowStart, { timezone: data.timezone }),
      ...(energy === "low" || energy === "medium" || energy === "high" ? { reportedEnergy: energy } : {}),
      ...(report.blocker ? { blockers: [report.blocker] } : {}),
    }];
  });
  const inputs = (result.patterns as any[]).map((pattern) => ({ patterns: [{ pattern }], reflections, outcomes: data.outcomes, window }));
  const composed = composeInsights(inputs.length ? inputs : [{ patterns: [], reflections, outcomes: data.outcomes, window }]);
  const insights = composed.filter((insight) => insight.status === "DETECTED");
  return { state: insights.length ? "ok" : result.state === "ok" || result.state === "no-findings" ? "no-findings" : result.state,
    window, insights, diagnostics: result.diagnostics };
}
