import {
  deriveSessions,
  extractCheckInFeatures,
  extractDayFeatures,
  extractSessionFeatures,
  productivityPatterns,
  type DayFeatures,
  type DayTaskInput,
} from "@repo/analytics";
import type { CheckIn } from "@repo/types";
import { getDb } from "../../lib/prisma";
import { activityInRange, activitySummary, localDayRange } from "../activity/service";

export interface DailyAnalyticsResult {
  date: string;
  features: DayFeatures;
  // Backward compatibility fields for legacy UI consumers:
  activity: Awaited<ReturnType<typeof activitySummary>>;
  taskCompletionRate: number;
  checkIns: number;
  patterns: ReturnType<typeof productivityPatterns>;
}

export async function dailyAnalytics(
  userId: string,
  date?: string,
  timezone?: string,
): Promise<DailyAnalyticsResult> {
  const range = localDayRange(date, timezone);
  const targetDate = range.from.toISOString().slice(0, 10);

  const [activity, tasks, checkInRecords, events] = await Promise.all([
    activitySummary(userId, range.from, range.to),
    getDb().task.findMany({
      where: {
        userId,
        createdAt: { lt: range.to },
        OR: [{ completedAt: { gte: range.from } }, { status: { not: "cancelled" } }],
      },
    }),
    getDb().checkIn.findMany({
      where: { userId, createdAt: { gte: range.from, lt: range.to } },
    }),
    activityInRange(userId, range.from, range.to),
  ]);

  // Canonical Phase 2 feature extraction pipeline
  const checkInModels: CheckIn[] = checkInRecords.map((c) => ({
    id: c.id,
    userId: c.userId,
    workSessionId: c.workSessionId ?? null,
    taskId: c.taskId ?? null,
    createdAt: c.createdAt.toISOString(),
    windowStart: c.windowStart?.toISOString() ?? null,
    windowEnd: c.windowEnd?.toISOString() ?? null,
    activityAssessment: c.activityAssessment ?? null,
    alignment: c.alignment ?? null,
    reasons: c.reasons ?? [],
    state: c.state ?? null,
    energy: c.energy ?? null,
    focus: c.focus ?? null,
    note: c.note ?? null,
    questionVersion: c.questionVersion ?? "v1",
    source: c.source ?? "extension_hourly",
    deeperAnswers: (c.deeperAnswers as Record<string, string>) ?? null,
    intent: c.intent ?? null,
    progress: c.progress ?? null,
    blocker: c.blocker ?? null,
    productive: c.productive ?? null,
    outcome: c.outcome ?? null,
  }));

  // Canonical check-in feature extraction
  checkInModels.map((c) => extractCheckInFeatures(c, events));

  // Canonical sessionization & session feature extraction
  const sessions = deriveSessions(events);
  const sessionFeatures = sessions.map((s) => extractSessionFeatures(s, events));

  // Canonical task input normalization
  const taskInputs: DayTaskInput[] = tasks.map((t) => ({
    status: t.status as DayTaskInput["status"],
    createdAt: t.createdAt.toISOString(),
  }));

  // Canonical day-level feature extraction
  const dayFeatures = extractDayFeatures({
    date: targetDate,
    sessionFeatures,
    tasks: taskInputs,
    checkIns: checkInModels,
  });

  return {
    date: targetDate,
    features: dayFeatures,
    // --- BACKWARD COMPATIBILITY ADAPTERS ---
    // Preserved strictly for existing legacy UI consumers; not to be used by modern analytical detectors.
    activity,
    taskCompletionRate: dayFeatures.taskCompletionRate,
    checkIns: dayFeatures.checkInCount,
    patterns: productivityPatterns(events),
  };
}

