import type { WorkSession } from "@repo/types";
import { getDb } from "../../lib/prisma";
import { wsManager } from "../websocket/server";

function serializeSession(session: {
  id: string;
  userId: string;
  taskId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  targetDurationMinutes?: number | null;
  isPaused?: boolean | null;
  pausedAt?: Date | null;
  lastResumedAt?: Date | null;
  source: string;
  notes?: string | null;
  createdAt?: Date | null;
  task?: {
    title: string;
    plannedDurationMinutes?: number | null;
    goal?: {
      title: string;
    } | null;
  } | null;
}): WorkSession {
  const targetDuration =
    session.targetDurationMinutes ??
    session.task?.plannedDurationMinutes ??
    null;

  let effectiveStart = session.startedAt;
  if (session.createdAt && session.startedAt.getTime() > session.createdAt.getTime() + 5000) {
    effectiveStart = session.createdAt;
  }
  if (session.endedAt && session.durationSeconds) {
    const wallClockSec = Math.round((session.endedAt.getTime() - effectiveStart.getTime()) / 1000);
    if (wallClockSec < session.durationSeconds) {
      const recoveredMs = session.endedAt.getTime() - session.durationSeconds * 1000;
      effectiveStart = new Date(Math.min(effectiveStart.getTime(), recoveredMs));
    }
  }

  return {
    id: session.id,
    userId: session.userId,
    taskId: session.taskId,
    startedAt: effectiveStart.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    durationSeconds: session.durationSeconds ?? 0,
    targetDurationMinutes: targetDuration,
    isPaused: Boolean(session.isPaused),
    pausedAt: session.pausedAt?.toISOString() ?? null,
    lastResumedAt: session.lastResumedAt?.toISOString() ?? null,
    source: session.source === "derived" ? "derived" : "manual",
    notes: session.notes,
    taskTitle: session.task?.title ?? null,
    goalTitle: session.task?.goal?.title ?? null,
  };
}

export async function listSessions(userId: string) {
  const sessions = await getDb().workSession.findMany({
    where: { userId },
    include: {
      task: {
        select: {
          title: true,
          plannedDurationMinutes: true,
          goal: {
            select: { title: true },
          },
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return sessions.map(serializeSession);
}

export async function getActiveSession(userId: string): Promise<WorkSession | null> {
  const session = await getDb().workSession.findFirst({
    where: { userId, endedAt: null },
    include: {
      task: {
        select: {
          title: true,
          plannedDurationMinutes: true,
          goal: {
            select: { title: true },
          },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  });

  return session ? serializeSession(session) : null;
}

export async function createSession(
  userId: string,
  input: {
    taskId?: string | null;
    targetDurationMinutes?: number | null;
    startedAt?: Date;
    endedAt?: Date | null;
    notes?: string | null;
  },
) {
  const db = getDb();
  let targetMins = input.targetDurationMinutes ?? null;

  // Inherit task plannedDurationMinutes if not explicitly passed
  if (!targetMins && input.taskId) {
    const task = await db.task.findFirst({
      where: { id: input.taskId, userId },
      select: { plannedDurationMinutes: true },
    });
    if (task?.plannedDurationMinutes) {
      targetMins = task.plannedDurationMinutes;
    }
  }

  const startedAt = input.startedAt ?? new Date();
  const endedAt = input.endedAt ?? null;
  const created = await db.workSession.create({
    data: {
      userId,
      taskId: input.taskId ?? null,
      targetDurationMinutes: targetMins,
      startedAt,
      endedAt,
      isPaused: false,
      pausedAt: null,
      lastResumedAt: startedAt,
      notes: input.notes ?? null,
      durationSeconds: endedAt
        ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
        : 0,
    },
    include: {
      task: {
        select: {
          title: true,
          plannedDurationMinutes: true,
          goal: {
            select: { title: true },
          },
        },
      },
    },
  });

  const serialized = serializeSession(created);
  wsManager.broadcastToUser(userId, {
    type: "session:started",
    session: serialized,
  });

  return serialized;
}

export async function pauseSession(userId: string, id: string): Promise<WorkSession> {
  const db = getDb();
  const existing = await db.workSession.findFirst({
    where: { id, userId, endedAt: null },
    include: {
      task: {
        select: {
          title: true,
          goal: {
            select: { title: true },
          },
        },
      },
    },
  });

  if (!existing) {
    const error = new Error("Active session not found");
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  if (existing.isPaused) {
    return serializeSession(existing);
  }

  const now = new Date();
  const lastActiveStart = existing.lastResumedAt ?? existing.startedAt;
  const segmentSeconds = Math.max(0, Math.round((now.getTime() - lastActiveStart.getTime()) / 1000));
  const newDuration = (existing.durationSeconds ?? 0) + segmentSeconds;

  const updated = await db.workSession.update({
    where: { id: existing.id },
    data: {
      isPaused: true,
      pausedAt: now,
      durationSeconds: newDuration,
    },
    include: {
      task: {
        select: {
          title: true,
          plannedDurationMinutes: true,
          goal: {
            select: { title: true },
          },
        },
      },
    },
  });

  const serialized = serializeSession(updated);
  wsManager.broadcastToUser(userId, {
    type: "session:paused",
    session: serialized,
  });

  return serialized;
}

export async function resumeSession(userId: string, id: string): Promise<WorkSession> {
  const db = getDb();
  const existing = await db.workSession.findFirst({
    where: { id, userId, endedAt: null },
    include: {
      task: {
        select: {
          title: true,
          plannedDurationMinutes: true,
          goal: {
            select: { title: true },
          },
        },
      },
    },
  });

  if (!existing) {
    const error = new Error("Active session not found");
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  if (!existing.isPaused) {
    return serializeSession(existing);
  }

  const now = new Date();
  const updated = await db.workSession.update({
    where: { id: existing.id },
    data: {
      isPaused: false,
      pausedAt: null,
      lastResumedAt: now, // Track new active segment without mutating immutable startedAt
    },
    include: {
      task: {
        select: {
          title: true,
          plannedDurationMinutes: true,
          goal: {
            select: { title: true },
          },
        },
      },
    },
  });

  const serialized = serializeSession(updated);
  wsManager.broadcastToUser(userId, {
    type: "session:resumed",
    session: serialized,
  });

  return serialized;
}

export async function updateSession(
  userId: string,
  id: string,
  input: { taskId?: string | null; endedAt?: Date | null; notes?: string | null },
) {
  const db = getDb();
  const existing = await db.workSession.findFirst({
    where: { id, userId },
    include: {
      task: {
        select: {
          title: true,
          goal: {
            select: { title: true },
          },
        },
      },
    },
  });
  if (!existing) {
    const error = new Error("Session not found");
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  const endedAt = input.endedAt === undefined ? existing.endedAt : input.endedAt;
  let finalDuration = existing.durationSeconds ?? 0;

  if (endedAt) {
    if (!existing.isPaused) {
      const lastActiveStart = existing.lastResumedAt ?? existing.startedAt;
      const segmentSeconds = Math.max(0, Math.round((endedAt.getTime() - lastActiveStart.getTime()) / 1000));
      finalDuration += segmentSeconds;
    }
  }

  const updated = await db.workSession.update({
    where: { id: existing.id },
    data: {
      taskId: input.taskId === undefined ? existing.taskId : input.taskId,
      endedAt,
      isPaused: endedAt ? false : existing.isPaused,
      pausedAt: endedAt ? null : existing.pausedAt,
      notes: input.notes === undefined ? existing.notes : input.notes,
      durationSeconds: endedAt ? finalDuration : existing.durationSeconds,
    },
    include: {
      task: {
        select: {
          title: true,
          plannedDurationMinutes: true,
          goal: {
            select: { title: true },
          },
        },
      },
    },
  });

  const serialized = serializeSession(updated);
  if (endedAt) {
    wsManager.broadcastToUser(userId, {
      type: "session:ended",
      session: serialized,
    });
  }

  return serialized;
}

export async function deleteSession(userId: string, id: string): Promise<{ success: boolean }> {
  const db = getDb();
  const existing = await db.workSession.findFirst({
    where: { id, userId },
  });

  if (!existing) {
    const error = new Error("Session not found");
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  await db.workSession.delete({
    where: { id: existing.id },
  });

  wsManager.broadcastToUser(userId, {
    type: "session:ended",
    sessionId: existing.id,
    discarded: true,
  });

  return { success: true };
}
