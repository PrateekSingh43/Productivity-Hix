import type { AttributionCorrection as AttributionCorrectionRow } from "@repo/db";
import type { AttributionCorrection, AttributionTargetKind } from "@repo/types";
import { getDb } from "../../lib/prisma";

/**
 * Phase 1 AttributionCorrection service (R1/R2).
 *
 * Corrections are the highest-precedence attribution source and are strictly
 * APPEND-ONLY: this module exposes create/read only. A newer correction may
 * carry a backward `supersedesCorrectionId` pointer (set at INSERT time,
 * informational); winner selection stays latest-wins by (createdAt, id) in
 * the analytics builder, so a stale pointer can never reopen an interval.
 *
 * targetKind is explicit: "TASK" requires a taskId and snapshots its title
 * server-side (task lookup is scoped to the caller); "NONE" records that the
 * window belongs to no task and stores no task reference.
 */

type Db = ReturnType<typeof getDb>;

function httpError(message: string, statusCode: number): Error {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

function serializeCorrection(row: AttributionCorrectionRow): AttributionCorrection {
  return {
    id: row.id,
    userId: row.userId,
    windowStart: row.windowStart.toISOString(),
    windowEnd: row.windowEnd.toISOString(),
    targetKind: row.targetKind as AttributionTargetKind,
    taskId: row.taskId,
    taskTitleSnapshot: row.taskTitleSnapshot,
    reason: row.reason,
    supersedesCorrectionId: row.supersedesCorrectionId,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface CreateCorrectionInput {
  windowStart: Date;
  windowEnd: Date;
  targetKind: AttributionTargetKind;
  taskId?: string | null;
  reason?: string | null;
  supersedesCorrectionId?: string | null;
}

export async function createCorrection(
  userId: string,
  input: CreateCorrectionInput,
): Promise<AttributionCorrection> {
  if (!(input.windowEnd.getTime() > input.windowStart.getTime())) {
    throw httpError("Correction window must end after it starts", 400);
  }

  const db = getDb();

  let taskId: string | null = null;
  let taskTitleSnapshot: string | null = null;
  if (input.targetKind === "TASK") {
    if (!input.taskId) {
      throw httpError("targetKind=TASK requires a taskId", 400);
    }
    const task = await db.task.findFirst({
      where: { id: input.taskId, userId },
      select: { id: true, title: true },
    });
    if (!task) {
      throw httpError("Task not found", 404);
    }
    taskId = task.id;
    taskTitleSnapshot = task.title;
  }

  let supersedesCorrectionId: string | null = null;
  if (input.supersedesCorrectionId) {
    const prior = await db.attributionCorrection.findFirst({
      where: { id: input.supersedesCorrectionId, userId },
      select: { id: true },
    });
    if (!prior) {
      throw httpError("Superseded correction not found", 400);
    }
    supersedesCorrectionId = prior.id;
  }

  const row = await db.attributionCorrection.create({
    data: {
      userId,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      targetKind: input.targetKind,
      taskId,
      taskTitleSnapshot,
      reason: input.reason ?? null,
      supersedesCorrectionId,
    },
  });
  return serializeCorrection(row);
}

export async function listCorrections(
  userId: string,
  options: { from?: Date; to?: Date; taskId?: string; limit?: number } = {},
): Promise<AttributionCorrection[]> {
  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const rows = await db.attributionCorrection.findMany({
    where: {
      userId,
      ...(options.taskId ? { taskId: options.taskId } : {}),
      ...(options.to ? { windowStart: { lt: options.to } } : {}),
      ...(options.from ? { windowEnd: { gt: options.from } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(serializeCorrection);
}
