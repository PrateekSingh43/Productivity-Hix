import type { WorkContext as WorkContextRow } from "@repo/db";
import type { WorkContext, WorkContextEndedReason } from "@repo/types";
import { getDb } from "../../lib/prisma";

/**
 * Phase 1 WorkContext service (R5).
 *
 * Invariants enforced here:
 * - At most one OPEN context per user: the database holds a partial unique
 *   index on (user_id) WHERE ended_at IS NULL; concurrent openers race on it
 *   and delay with P2002, mapped to 409.
 * - Switching is atomic close+open: the previous interval is closed with
 *   SWITCHED and a successor row is inserted in one transaction. Historical
 *   rows are never edited.
 * - Same-target switch is an idempotent no-op: the open interval keeps
 *   running (no close/open pair), so repeated signals don't fragment the
 *   timeline.
 * - Switching NEVER mutates WorkSession rows (documented stronger-than-
 *   existing session semantics from the plan).
 */

type Db = ReturnType<typeof getDb>;
type ContextClient = Pick<Db, "workContext">;

function httpError(message: string, statusCode: number): Error {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

function serializeContext(row: WorkContextRow): WorkContext {
  return {
    id: row.id,
    userId: row.userId,
    taskId: row.taskId,
    goalId: row.goalId,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    startedBySessionId: row.startedBySessionId,
    endedReason: (row.endedReason as WorkContextEndedReason | null) ?? null,
  };
}

export async function getCurrentContext(userId: string): Promise<WorkContext | null> {
  const db = getDb();
  const row = await db.workContext.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  return row ? serializeContext(row) : null;
}

export async function listContextHistory(
  userId: string,
  options: { taskId?: string; from?: Date; to?: Date; limit?: number } = {},
): Promise<WorkContext[]> {
  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const rows = await db.workContext.findMany({
    where: {
      userId,
      ...(options.taskId ? { taskId: options.taskId } : {}),
      ...(options.from || options.to
        ? {
            startedAt: {
              ...(options.from ? { gte: options.from } : {}),
              ...(options.to ? { lte: options.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  return rows.map(serializeContext);
}

export interface SwitchContextInput {
  taskId?: string | null;
  goalId?: string | null;
  startedAt?: Date;
}

export async function switchContext(
  userId: string,
  input: SwitchContextInput,
): Promise<{ context: WorkContext; previous: WorkContext | null }> {
  const taskId = input.taskId ?? null;
  const goalId = input.goalId ?? null;
  if (!taskId && !goalId) {
    throw httpError("A work context requires a taskId or goalId target", 400);
  }

  const db = getDb();
  const now = input.startedAt ?? new Date();
  try {
    return await db.$transaction(async (tx) => {
      const open = await tx.workContext.findFirst({
        where: { userId, endedAt: null },
        orderBy: { startedAt: "desc" },
      });

      if (open && open.taskId === taskId && open.goalId === goalId) {
        return { context: serializeContext(open), previous: null };
      }

      let previous: WorkContext | null = null;
      if (open) {
        const closed = await tx.workContext.update({
          where: { id: open.id },
          data: { endedAt: now, endedReason: "SWITCHED" },
        });
        previous = serializeContext(closed);
      }

      const created = await tx.workContext.create({
        data: {
          userId,
          taskId,
          goalId,
          startedAt: now,
          endedAt: null,
          startedBySessionId: null,
          endedReason: null,
        },
      });

      return { context: serializeContext(created), previous };
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      throw httpError(
        "A concurrent context switch won the race; retry to see the current context",
        409,
      );
    }
    throw error;
  }
}

export async function endContext(
  userId: string,
  input: { endedAt?: Date } = {},
): Promise<{ context: WorkContext | null }> {
  const db = getDb();
  const now = input.endedAt ?? new Date();
  return await db.$transaction(async (tx) => {
    const open = await tx.workContext.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (!open) {
      return { context: null };
    }
    const closed = await tx.workContext.update({
      where: { id: open.id },
      data: { endedAt: now, endedReason: "USER_ENDED" },
    });
    return { context: serializeContext(closed) };
  });
}

export interface SessionStartContextInput {
  taskId: string | null;
  sessionId: string;
  startedAt: Date;
}

/**
 * Session-start association (R5): runs INSIDE the session-creation
 * transaction. Task-less sessions never touch context state. For a task
 * session:
 * - no open context: open one attributed to the task, recording the session;
 * - open context already on that task: adopt it (record the session id) —
 *   the interval keeps running;
 * - open context on another task: close it with SESSION_ASSOCIATED and open
 *   the session task's context.
 */
export async function ensureContextForSessionStart(
  tx: ContextClient,
  userId: string,
  input: SessionStartContextInput,
): Promise<void> {
  if (!input.taskId) return;

  const open = await tx.workContext.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (open && open.taskId === input.taskId && !open.startedBySessionId) {
    await tx.workContext.update({
      where: { id: open.id },
      data: { startedBySessionId: input.sessionId },
    });
    return;
  }

  if (open && open.taskId === input.taskId) {
    return;
  }

  if (open) {
    await tx.workContext.update({
      where: { id: open.id },
      data: { endedAt: input.startedAt, endedReason: "SESSION_ASSOCIATED" },
    });
  }

  await tx.workContext.create({
    data: {
      userId,
      taskId: input.taskId,
      goalId: null,
      startedAt: input.startedAt,
      endedAt: null,
      startedBySessionId: input.sessionId,
      endedReason: null,
    },
  });
}
