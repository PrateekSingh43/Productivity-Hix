import {
  resolveProductiveDay,
  type Task,
  type TaskWithSessions,
  type TaskObservedActivityItem,
} from "@repo/types";
import {
  normalizeAppName,
  cleanWindowTitle,
  inferSiteLabel,
  normalizeRawActivityEvents,
  normalizeIntervals,
} from "@repo/analytics";
import { getDb } from "../../lib/prisma";

type TaskWithSessionRows = {
  id: string;
  userId: string;
  goalId?: string | null;
  productiveDate?: string | null;
  title: string;
  description: string | null;
  status: Task["status"];
  priority: string;
  plannedDurationMinutes: number | null;
  plannedStart?: Date | null;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  goal?: {
    id: string;
    title: string;
  } | null;
  sessions?: Array<{
    id: string;
    startedAt: Date;
    endedAt: Date | null;
    durationSeconds: number | null;
    notes?: string | null;
  }>;
};

export function serializeTask(task: TaskWithSessionRows): Task {
  const sessions = task.sessions ?? [];
  const actualDurationSeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
  const hasActiveSession = sessions.some((s) => !s.endedAt);

  const resolvedProductiveDate =
    task.productiveDate ??
    (task.dueAt ? resolveProductiveDay(task.dueAt) : resolveProductiveDay(task.createdAt));

  return {
    id: task.id,
    userId: task.userId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: (task.priority as Task["priority"]) || "medium",
    plannedDurationMinutes: task.plannedDurationMinutes ?? 30,
    plannedStart: task.plannedStart?.toISOString() ?? null,
    actualDurationSeconds,
    dueAt: task.dueAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    goalId: task.goalId ?? null,
    goalTitle: task.goal?.title ?? null,
    productiveDate: resolvedProductiveDate,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    sessionsCount: sessions.length,
    hasActiveSession,
  };
}

export async function listTasks(
  userId: string,
  filters?: {
    productiveDate?: string;
    status?: Task["status"];
    goalId?: string | null;
  }
): Promise<Task[]> {
  const where: any = { userId };
  if (filters?.productiveDate) {
    where.productiveDate = filters.productiveDate;
  }
  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.goalId !== undefined) {
    where.goalId = filters.goalId;
  }

  const tasks = await getDb().task.findMany({
    where,
    include: {
      goal: {
        select: {
          id: true,
          title: true,
        },
      },
      sessions: {
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
          notes: true,
        },
        orderBy: { startedAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return tasks.map(serializeTask);
}

export async function getTask(userId: string, id: string): Promise<TaskWithSessions | null> {
  const db = getDb();
  const task = await db.task.findFirst({
    where: { id, userId },
    include: {
      goal: {
        select: {
          id: true,
          title: true,
        },
      },
      sessions: {
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
          notes: true,
          isPaused: true,
          lastResumedAt: true,
          createdAt: true,
        },
        orderBy: { startedAt: "desc" },
      },
      checkIns: {
        select: {
          id: true,
          activityAssessment: true,
          alignment: true,
          energy: true,
          focus: true,
          note: true,
          outcome: true,
          blocker: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!task) return null;

  const serialized = serializeTask(task);
  const sessionList = (task.sessions || []).map((s) => {
    let effectiveStart = s.startedAt;
    if (s.createdAt && s.startedAt.getTime() > s.createdAt.getTime() + 5000) {
      effectiveStart = s.createdAt;
    }
    if (s.endedAt && s.durationSeconds) {
      const wallClockSec = Math.round((s.endedAt.getTime() - effectiveStart.getTime()) / 1000);
      if (wallClockSec < s.durationSeconds) {
        const recoveredMs = s.endedAt.getTime() - s.durationSeconds * 1000;
        effectiveStart = new Date(Math.min(effectiveStart.getTime(), recoveredMs));
      }
    }

    return {
      id: s.id,
      startedAt: effectiveStart.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      durationSeconds: s.durationSeconds,
      isPaused: Boolean(s.isPaused),
      lastResumedAt: s.lastResumedAt?.toISOString() ?? null,
      notes: s.notes,
    };
  });

  const checkInList = ((task as any).checkIns || []).map((c: any) => ({
    id: c.id,
    activityAssessment: c.activityAssessment ?? null,
    alignment: c.alignment ?? null,
    energy: c.energy ?? null,
    focus: c.focus ?? null,
    note: c.note ?? null,
    outcome: c.outcome ?? null,
    blocker: c.blocker ?? null,
    createdAt: c.createdAt.toISOString(),
  }));

  return {
    ...serialized,
    sessions: sessionList,
    checkIns: checkInList,
  };
}

export async function getTaskObservedActivity(
  userId: string,
  taskId: string,
): Promise<TaskObservedActivityItem[]> {
  const db = getDb();
  const task = await db.task.findFirst({
    where: { id: taskId, userId },
    include: {
      sessions: {
        select: { startedAt: true, endedAt: true, durationSeconds: true },
      },
    },
  });

  if (!task || task.sessions.length === 0) {
    return [];
  }

  // Calculate inclusive coverage spans for each session.
  // If a historical session had its startedAt overwritten by a past resume bug (i.e. endedAt - startedAt < durationSeconds),
  // recover the true window by projecting backwards from endedAt.
  const sessionRanges = task.sessions
    .filter((s) => (s.durationSeconds ?? 0) > 0 || !s.endedAt)
    .map((s) => {
      const end = s.endedAt || new Date();
      let start = s.startedAt;
      if (s.endedAt && s.durationSeconds) {
        const wallClockSec = Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 1000);
        if (wallClockSec < s.durationSeconds) {
          // Recover true start time with 2-minute buffer
          const recoveredMs = s.endedAt.getTime() - (s.durationSeconds + 120) * 1000;
          start = new Date(Math.min(s.startedAt.getTime(), recoveredMs));
        }
      }
      return { start, end };
    });

  if (sessionRanges.length === 0) {
    return [];
  }

  const orClauses = sessionRanges.map((r) => ({
    timestamp: {
      gte: r.start,
      lte: r.end,
    },
  }));

  const activities = await db.normalizedActivity.findMany({
    where: {
      userId,
      OR: orClauses,
    },
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
  });

  if (activities.length === 0) {
    return [];
  }

  const canonical = normalizeRawActivityEvents(activities.map((a) => ({
    id: a.id,
    externalId: a.externalId,
    timestamp: a.timestamp,
    duration: a.duration,
    source: a.source,
    watcher: a.watcher,
    data: a.data,
  })));

  const normalized = normalizeIntervals(canonical);

  // Group by { application, domain, title } across all switches
  interface ClusterItem {
    application: string;
    domain: string | null;
    title: string;
    durationSeconds: number;
  }

  const clusterMap = new Map<string, ClusterItem>();
  let totalTrackedSeconds = 0;

  for (const n of normalized) {
    if (n.isAfk) continue;
    const durSec = Math.max(0, Math.round(n.durationMs / 1000));
    if (durSec < 1) continue;

    const displayApp = n.application;
    const displayTitle = n.title || displayApp;
    const domain = n.domain || null;

    const key = `${displayApp}:::${domain ?? ""}:::${displayTitle}`;
    totalTrackedSeconds += durSec;

    const existing = clusterMap.get(key);
    if (existing) {
      existing.durationSeconds += durSec;
    } else {
      clusterMap.set(key, {
        application: displayApp,
        domain,
        title: displayTitle,
        durationSeconds: durSec,
      });
    }
  }

  return Array.from(clusterMap.values())
    .map((item) => ({
      application: item.application,
      domain: item.domain,
      title: item.title,
      durationSeconds: item.durationSeconds,
      percentage:
        totalTrackedSeconds > 0
          ? Math.round((item.durationSeconds / totalTrackedSeconds) * 100)
          : 0,
    }))
    .filter((item) => item.durationSeconds >= 5) // Exclude transient blips < 5s
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, 10);
}

export async function createTask(
  userId: string,
  input: {
    title: string;
    description?: string | null;
    dueAt?: Date | null;
    priority?: "none" | "low" | "medium" | "high";
    plannedDurationMinutes?: number;
    plannedStart?: Date | null;
    goalId?: string | null;
    productiveDate?: string | null;
  },
) {
  let productiveDate = input.productiveDate;
  const dueDateStr = input.dueAt ? resolveProductiveDay(input.dueAt) : null;

  if (!productiveDate && input.goalId) {
    const goal = await getDb().dailyGoal.findUnique({
      where: { id: input.goalId },
      include: { plan: { select: { date: true } } },
    });
    if (goal?.plan?.date) {
      // If the task's due date is later than the goal's plan date, honor the due date
      if (dueDateStr && dueDateStr > goal.plan.date) {
        productiveDate = dueDateStr;
      } else {
        productiveDate = goal.plan.date;
      }
    }
  }
  if (!productiveDate) {
    productiveDate = dueDateStr ?? resolveProductiveDay(new Date());
  }

  const created = await getDb().task.create({
    data: {
      userId,
      title: input.title,
      description: input.description,
      dueAt: input.dueAt,
      plannedStart: input.plannedStart ?? null,
      priority: input.priority ?? "medium",
      plannedDurationMinutes: input.plannedDurationMinutes ?? 30,
      goalId: input.goalId,
      productiveDate,
    },
    include: {
      goal: {
        select: {
          id: true,
          title: true,
        },
      },
      sessions: true,
    },
  });

  return serializeTask(created);
}

export async function updateTask(
  userId: string,
  id: string,
  input: {
    title?: string;
    description?: string | null;
    dueAt?: Date | null;
    plannedStart?: Date | null;
    priority?: "none" | "low" | "medium" | "high";
    plannedDurationMinutes?: number;
    status?: "todo" | "in_progress" | "done" | "cancelled";
    goalId?: string | null;
    productiveDate?: string | null;
  },
) {
  const dataToUpdate: Record<string, unknown> = { ...input };
  if (input.dueAt !== undefined && input.productiveDate === undefined) {
    dataToUpdate.productiveDate = input.dueAt ? resolveProductiveDay(input.dueAt) : null;
  }

  const updated = await getDb().task.update({
    where: { id, userId },
    data: {
      ...dataToUpdate,
      completedAt: input.status === "done" ? new Date() : input.status ? null : undefined,
    },
    include: {
      goal: {
        select: {
          id: true,
          title: true,
        },
      },
      sessions: {
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
          notes: true,
        },
      },
    },
  });

  return serializeTask(updated);
}

export async function deleteTask(userId: string, id: string) {
  await getDb().task.delete({
    where: { id, userId },
  });
  return { success: true };
}
