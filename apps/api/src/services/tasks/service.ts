import type { Task, TaskWithSessions } from "@repo/types";
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

  return {
    id: task.id,
    userId: task.userId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: (task.priority as Task["priority"]) || "medium",
    plannedDurationMinutes: task.plannedDurationMinutes ?? 30,
    actualDurationSeconds,
    dueAt: task.dueAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    goalId: task.goalId ?? null,
    goalTitle: task.goal?.title ?? null,
    productiveDate: task.productiveDate ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    sessionsCount: sessions.length,
    hasActiveSession,
  };
}

export async function listTasks(userId: string): Promise<Task[]> {
  const tasks = await getDb().task.findMany({
    where: { userId },
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
        },
        orderBy: { startedAt: "desc" },
      },
    },
  });

  if (!task) return null;

  const serialized = serializeTask(task);
  const sessionList = (task.sessions || []).map((s) => ({
    id: s.id,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    durationSeconds: s.durationSeconds,
    notes: s.notes,
  }));

  return {
    ...serialized,
    sessions: sessionList,
  };
}

export async function getTaskObservedActivity(userId: string, taskId: string) {
  const db = getDb();
  const task = await db.task.findFirst({
    where: { id: taskId, userId },
    include: {
      sessions: {
        select: { startedAt: true, endedAt: true },
      },
    },
  });

  if (!task || task.sessions.length === 0) {
    return [];
  }

  // Find all activities across any session interval for this task
  const sessionRanges = task.sessions.map((s) => ({
    start: s.startedAt,
    end: s.endedAt || new Date(),
  }));

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
      source: true,
      watcher: true,
      duration: true,
      data: true,
    },
  });

  // Aggregate by app name or domain
  const appMap = new Map<string, number>();
  for (const act of activities) {
    const data = (act.data ?? {}) as Record<string, unknown>;
    const app = (data.application as string) || (data.domain as string) || act.source;
    appMap.set(app, (appMap.get(app) ?? 0) + act.duration);
  }

  return Array.from(appMap.entries())
    .map(([application, durationSeconds]) => ({
      application,
      durationSeconds: Math.round(durationSeconds),
    }))
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
    goalId?: string | null;
    productiveDate?: string | null;
  },
) {
  const created = await getDb().task.create({
    data: {
      userId,
      title: input.title,
      description: input.description,
      dueAt: input.dueAt,
      priority: input.priority ?? "medium",
      plannedDurationMinutes: input.plannedDurationMinutes ?? 30,
      goalId: input.goalId,
      productiveDate: input.productiveDate,
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
    priority?: "none" | "low" | "medium" | "high";
    plannedDurationMinutes?: number;
    status?: "todo" | "in_progress" | "done" | "cancelled";
    goalId?: string | null;
    productiveDate?: string | null;
  },
) {
  const updated = await getDb().task.update({
    where: { id, userId },
    data: {
      ...input,
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
