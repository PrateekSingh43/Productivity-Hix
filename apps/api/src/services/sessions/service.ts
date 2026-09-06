import type { WorkSession } from "@repo/types";
import { getDb } from "../../lib/prisma";

function serializeSession(session: {
  id: string;
  userId: string;
  taskId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  source: string;
  notes: string | null;
}): WorkSession {
  return {
    id: session.id,
    userId: session.userId,
    taskId: session.taskId,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    durationSeconds: session.durationSeconds,
    source: session.source === "derived" ? "derived" : "manual",
    notes: session.notes,
  };
}

export async function listSessions(userId: string) {
  const sessions = await getDb().workSession.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return sessions.map(serializeSession);
}

export async function createSession(
  userId: string,
  input: { taskId?: string | null; startedAt?: Date; endedAt?: Date | null; notes?: string | null },
) {
  const startedAt = input.startedAt ?? new Date();
  const endedAt = input.endedAt ?? null;
  return serializeSession(
    await getDb().workSession.create({
      data: {
        userId,
        taskId: input.taskId ?? null,
        startedAt,
        endedAt,
        notes: input.notes ?? null,
        durationSeconds: endedAt
          ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
          : null,
      },
    }),
  );
}

export async function updateSession(
  userId: string,
  id: string,
  input: { taskId?: string | null; endedAt?: Date | null; notes?: string | null },
) {
  const db = getDb();
  const existing = await db.workSession.findFirst({ where: { id, userId } });
  if (!existing) {
    const error = new Error("Session not found");
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  const endedAt = input.endedAt === undefined ? existing.endedAt : input.endedAt;
  return serializeSession(
    await db.workSession.update({
      where: { id: existing.id },
      data: {
        taskId: input.taskId === undefined ? existing.taskId : input.taskId,
        endedAt,
        notes: input.notes === undefined ? existing.notes : input.notes,
        durationSeconds: endedAt
          ? Math.max(0, Math.round((endedAt.getTime() - existing.startedAt.getTime()) / 1000))
          : null,
      },
    }),
  );
}
