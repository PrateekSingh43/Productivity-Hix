import { buildEvidenceTimeline } from "@repo/analytics";
import type {
  AttributionCorrection,
  CheckIn,
  DailyGoal,
  EvidenceTimeline,
  NormalizedActivityEvent,
  Task,
  UserGapExplanation,
  WorkContext,
  WorkSession,
} from "@repo/types";
import { getDb } from "../../lib/prisma";

/**
 * Phase 1 Slice C: task evidence read model.
 *
 * Loads committed rows (telemetry, sessions, contexts, corrections,
 * check-ins, gap explanations) for a window, runs the PURE evidence builder
 * (the same one used by tests and analytics), and returns evidence plus
 * freshness metadata (R3) computed per request from those committed rows.
 * The response never reuses the timeline snapshot stale flag.
 */

type Db = ReturnType<typeof getDb>;

function httpError(message: string, statusCode: number): Error {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

export interface EvidenceFreshness {
  computedAt: string;
  windowStart: string;
  windowEnd: string;
  /** Latest telemetry coverage end inside the window, or null if none. */
  telemetryThrough: string | null;
  inputs: {
    activityEvents: number;
    sessions: number;
    workContexts: number;
    corrections: number;
    checkIns: number;
    gapExplanations: number;
  };
}

export interface TaskEvidenceResult {
  taskId: string;
  taskTitle: string;
  evidence: EvidenceTimeline;
  freshness: EvidenceFreshness;
}

function toWorkSession(row: {
  id: string;
  userId: string;
  taskId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  targetDurationMinutes: number | null;
  isPaused: boolean;
  pausedAt: Date | null;
  lastResumedAt: Date | null;
  source: string;
  notes: string | null;
}): WorkSession {
  return {
    id: row.id,
    userId: row.userId,
    taskId: row.taskId,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    durationSeconds: row.durationSeconds,
    targetDurationMinutes: row.targetDurationMinutes,
    isPaused: row.isPaused,
    pausedAt: row.pausedAt ? row.pausedAt.toISOString() : null,
    lastResumedAt: row.lastResumedAt ? row.lastResumedAt.toISOString() : null,
    source: row.source === "derived" ? "derived" : "manual",
    notes: row.notes,
  };
}

function toWorkContext(row: {
  id: string;
  userId: string;
  taskId: string | null;
  goalId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  startedBySessionId: string | null;
  endedReason: string | null;
}): WorkContext {
  return {
    id: row.id,
    userId: row.userId,
    taskId: row.taskId,
    goalId: row.goalId,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    startedBySessionId: row.startedBySessionId,
    endedReason: row.endedReason as WorkContext["endedReason"],
  };
}

function toCorrection(row: {
  id: string;
  userId: string;
  windowStart: Date;
  windowEnd: Date;
  targetKind: string;
  taskId: string | null;
  taskTitleSnapshot: string | null;
  reason: string | null;
  supersedesCorrectionId: string | null;
  createdAt: Date;
}): AttributionCorrection {
  return {
    id: row.id,
    userId: row.userId,
    windowStart: row.windowStart.toISOString(),
    windowEnd: row.windowEnd.toISOString(),
    targetKind: row.targetKind as AttributionCorrection["targetKind"],
    taskId: row.taskId,
    taskTitleSnapshot: row.taskTitleSnapshot,
    reason: row.reason,
    supersedesCorrectionId: row.supersedesCorrectionId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCheckIn(row: {
  id: string;
  userId: string;
  workSessionId: string | null;
  taskId: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  activityAssessment: string | null;
  alignment: string | null;
  reasons: string[];
  state: string | null;
  energy: string | null;
  focus: string | null;
  note: string | null;
  questionVersion: string;
  source: string;
  deeperAnswers: unknown;
  intent: string | null;
  progress: boolean | null;
  blocker: string | null;
  productive: boolean | null;
  outcome: string | null;
  createdAt: Date;
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
    reasons: row.reasons,
    state: row.state,
    energy: row.energy,
    focus: row.focus,
    note: row.note,
    questionVersion: row.questionVersion,
    source: row.source,
    deeperAnswers: (row.deeperAnswers as Record<string, string> | null) ?? null,
    intent: row.intent,
    progress: row.progress,
    blocker: row.blocker,
    productive: row.productive,
    outcome: row.outcome,
    createdAt: row.createdAt.toISOString(),
  };
}

function toGapExplanation(row: {
  id: string;
  gapId: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  explanationType: string;
  description: string;
  offlineWorkContext: string | null;
  associatedTaskId: string | null;
  associatedGoalId: string | null;
  createdAt: Date;
}): UserGapExplanation {
  return {
    id: row.id,
    gapId: row.gapId,
    userId: row.userId,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    explanationType: row.explanationType,
    description: row.description,
    offlineWorkContext: row.offlineWorkContext,
    associatedTaskId: row.associatedTaskId,
    associatedGoalId: row.associatedGoalId,
    createdAt: row.createdAt.toISOString(),
  };
}

function toTask(row: {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  plannedDurationMinutes: number | null;
  plannedStart: Date | null;
  dueAt: Date | null;
  completedAt: Date | null;
  goalId: string | null;
  productiveDate: string | null;
  createdAt: Date;
  updatedAt: Date;
  goal?: { id: string; planId: string; userId: string; title: string; order: number; outcome: string | null; createdAt: Date; updatedAt: Date } | null;
}): Task {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description,
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
    plannedDurationMinutes: row.plannedDurationMinutes ?? 30,
    plannedStart: row.plannedStart ? row.plannedStart.toISOString() : null,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    goalId: row.goalId,
    goalTitle: row.goal?.title ?? null,
    productiveDate: row.productiveDate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface EvidenceInputs {
  events: NormalizedActivityEvent[];
  sessions: WorkSession[];
  workContexts: WorkContext[];
  corrections: AttributionCorrection[];
  checkIns: CheckIn[];
  gapExplanations: UserGapExplanation[];
  counts: EvidenceFreshness["inputs"];
  telemetryThrough: string | null;
}

/**
 * Loads and serializes all evidence inputs overlapping [from, to] in one
 * pass. Exposed so batch consumers (e.g. per-session summaries) can load the
 * union range once and build per-window evidence in memory.
 */
export async function loadEvidenceInputs(
  db: Db,
  userId: string,
  window: { from: Date; to: Date },
): Promise<EvidenceInputs> {
  const { from, to } = window;
  const [activityRows, sessionRows, contextRows, correctionRows, checkInRows, gapRows] =
    await Promise.all([
      db.normalizedActivity.findMany({
        where: { userId, timestamp: { gte: from, lte: to } },
        select: {
          id: true,
          externalId: true,
          timestamp: true,
          source: true,
          watcher: true,
          duration: true,
          data: true,
        },
        orderBy: { timestamp: "asc" },
      }),
      db.workSession.findMany({
        where: {
          userId,
          startedAt: { lt: to },
          OR: [{ endedAt: null }, { endedAt: { gt: from } }],
        },
        select: {
          id: true,
          userId: true,
          taskId: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
          targetDurationMinutes: true,
          isPaused: true,
          pausedAt: true,
          lastResumedAt: true,
          source: true,
          notes: true,
        },
        orderBy: { startedAt: "asc" },
      }),
      db.workContext.findMany({
        where: {
          userId,
          startedAt: { lt: to },
          OR: [{ endedAt: null }, { endedAt: { gt: from } }],
        },
        orderBy: { startedAt: "asc" },
      }),
      db.attributionCorrection.findMany({
        where: { userId, windowStart: { lt: to }, windowEnd: { gt: from } },
        orderBy: { createdAt: "asc" },
      }),
      db.checkIn.findMany({
        where: {
          userId,
          OR: [
            { windowStart: { gte: from, lte: to } },
            { windowStart: null, createdAt: { gte: from, lte: to } },
          ],
        },
        orderBy: { createdAt: "asc" },
      }),
      db.userGapExplanation.findMany({
        where: { userId, startTime: { lt: to }, endTime: { gt: from } },
        orderBy: { startTime: "asc" },
      }),
    ]);

  const events: NormalizedActivityEvent[] = activityRows.map((row) => ({
    id: row.id,
    bucketId: row.externalId ?? row.id,
    externalId: row.externalId ?? row.id,
    timestamp: row.timestamp.toISOString(),
    duration: row.duration ?? 0,
    source: row.source as NormalizedActivityEvent["source"],
    watcher: row.watcher as NormalizedActivityEvent["watcher"],
    data: (row.data as Record<string, unknown> | null) ?? {},
  }));

  let telemetryThrough: string | null = null;
  let telemetryThroughMs = -Infinity;
  for (const row of activityRows) {
    const endMs = row.timestamp.getTime() + (row.duration ?? 0) * 1000;
    if (endMs > telemetryThroughMs) {
      telemetryThroughMs = endMs;
      telemetryThrough = new Date(endMs).toISOString();
    }
  }

  return {
    events,
    sessions: sessionRows.map(toWorkSession),
    workContexts: contextRows.map(toWorkContext),
    corrections: correctionRows.map(toCorrection),
    checkIns: checkInRows.map(toCheckIn),
    gapExplanations: gapRows.map(toGapExplanation),
    counts: {
      activityEvents: activityRows.length,
      sessions: sessionRows.length,
      workContexts: contextRows.length,
      corrections: correctionRows.length,
      checkIns: checkInRows.length,
      gapExplanations: gapRows.length,
    },
    telemetryThrough,
  };
}

export async function getTaskEvidence(
  userId: string,
  taskId: string,
  window: { from: Date; to: Date },
): Promise<TaskEvidenceResult> {
  const db = getDb();
  const task = await db.task.findFirst({
    where: { id: taskId, userId },
    include: { goal: true },
  });
  if (!task) {
    throw httpError("Task not found", 404);
  }

  const inputs = await loadEvidenceInputs(db, userId, window);

  const goals: DailyGoal[] = task.goal
    ? [
        {
          id: task.goal.id,
          planId: task.goal.planId,
          userId: task.goal.userId,
          title: task.goal.title,
          order: task.goal.order,
          outcome: task.goal.outcome as DailyGoal["outcome"],
          createdAt: task.goal.createdAt.toISOString(),
          updatedAt: task.goal.updatedAt.toISOString(),
        },
      ]
    : [];

  const evidence = buildEvidenceTimeline({
    windowStart: window.from,
    windowEnd: window.to,
    events: inputs.events,
    sessions: inputs.sessions,
    workContexts: inputs.workContexts,
    corrections: inputs.corrections,
    checkIns: inputs.checkIns,
    gapExplanations: inputs.gapExplanations,
    tasks: [toTask(task)],
    goals,
  });

  return {
    taskId: task.id,
    taskTitle: task.title,
    evidence,
    freshness: {
      computedAt: new Date().toISOString(),
      windowStart: window.from.toISOString(),
      windowEnd: window.to.toISOString(),
      telemetryThrough: inputs.telemetryThrough,
      inputs: inputs.counts,
    },
  };
}
