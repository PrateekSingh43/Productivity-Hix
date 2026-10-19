import type { WorkSession } from "@repo/types";
import type { SessionListQueryInput } from "@repo/validation";
import { buildEvidenceTimeline } from "@repo/analytics";
import { getDb } from "../../lib/prisma";
import { wsManager } from "../websocket/server";
import { ensureContextForSessionStart } from "../work-contexts/service";
import { loadEvidenceInputs } from "../task-evidence/service";

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
}, hasReflection = false): WorkSession {
  // A session target is the target chosen for THIS execution block. It is
  // deliberately NOT inherited from the task's planned duration: the task
  // plan describes the size of the whole unit of work, the session target
  // describes one sitting. An omitted target persists as null so history
  // can honestly render "Target not set" instead of a fabricated number.
  const targetDuration = session.targetDurationMinutes ?? null;

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
    hasReflection,
  };
}

export async function listSessions(
  userId: string,
  options?: SessionListQueryInput | { from: Date; to: Date },
) {
  const where: Record<string, unknown> = { userId };

  if (options) {
    if ("taskId" in options && options.taskId) {
      where.taskId = options.taskId;
    }

    if ("linked" in options && options.linked === "linked") {
      where.taskId = { not: null };
    } else if ("linked" in options && options.linked === "independent") {
      where.taskId = null;
    }

    if ("search" in options && options.search) {
      const term = options.search.trim();
      if (term) {
        where.OR = [
          { notes: { contains: term, mode: "insensitive" } },
          { task: { title: { contains: term, mode: "insensitive" } } },
          { task: { goal: { title: { contains: term, mode: "insensitive" } } } },
        ];
      }
    }

    // Check if legacy pattern window format { from: Date, to: Date } without limit
    if ("from" in options && options.from && "to" in options && options.to && !("limit" in options)) {
      where.startedAt = { lt: options.to };
      where.AND = [
        {
          OR: [{ endedAt: { gt: options.from } }, { endedAt: null }],
        },
      ];
    } else {
      if (options.from || options.to) {
        const startedAtFilter: Record<string, Date> = {};
        if (options.from) startedAtFilter.gte = options.from;
        if (options.to) startedAtFilter.lte = options.to;
        where.startedAt = startedAtFilter;
      }
    }
  }

  const limit =
    options && "limit" in options && typeof options.limit === "number"
      ? Math.min(Math.max(options.limit, 1), 500)
      : options && "from" in options && "to" in options && !("limit" in options)
      ? undefined
      : 50;

  const sessions = await getDb().workSession.findMany({
    where,
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
    orderBy: [{ startedAt: "desc" }, { id: "asc" }],
    ...(limit !== undefined ? { take: limit } : {}),
  });
  // Reflection presence per session (one query for the whole page, not N+1).
  // A missing checkIn delegate (older test mocks) means "none recorded".
  const reflectedIds = new Set<string>();
  try {
    const checkInDelegate = (getDb() as unknown as Record<string, unknown>).checkIn as
      | { findMany: (args: unknown) => Promise<Array<{ workSessionId: string | null }>> }
      | undefined;
    if (checkInDelegate) {
      const rows = await checkInDelegate.findMany({
        where: {
          userId,
          workSessionId: { in: sessions.map((s) => s.id) },
        },
        select: { workSessionId: true },
      });
      for (const row of rows) {
        if (row.workSessionId) reflectedIds.add(row.workSessionId);
      }
    }
  } catch {
    // Reflection presence is advisory display state; never fail the list.
  }
  return sessions.map((s) => serializeSession(s, reflectedIds.has(s.id)));
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
  // One-active-session invariant: a second concurrent session would fork
  // timers no client can pause or discard coherently (duplicate rows, split
  // durations, 404s on stale ids). Fail loudly with 409 so every client —
  // web, extension, desktop — converges on the existing session instead.
  const alreadyActive = await db.workSession.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (alreadyActive) {
    const error = new Error("A focus session is already active") as Error & {
      statusCode?: number;
    };
    error.statusCode = 409;
    throw error;
  }
  // No inheritance from the linked task's planned duration (see note above):
  // what is stored is exactly what the caller set, or null.
  const targetMins = input.targetDurationMinutes ?? null;

  const startedAt = input.startedAt ?? new Date();
  const endedAt = input.endedAt ?? null;
  // R5: the session row and its work-context association commit or roll back
  // together. The broadcast happens after commit, so listeners never observe
  // a session whose context was rolled back.
  const created = await db.$transaction(async (tx) => {
    const session = await tx.workSession.create({
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
    await ensureContextForSessionStart(tx, userId, {
      taskId: input.taskId ?? null,
      sessionId: session.id,
      startedAt,
    });
    return session;
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

export interface SessionObservedSummary {
  /** Top applications observed within the session window (max 3, each ≥5s). */
  apps: string[];
  /**
   * Non-AFK telemetry-observed seconds inside this session's window.
   * NOT additive across sessions: overlapping windows (only possible when
   * the one-active invariant was bypassed) may each include the same
   * seconds. Treat these as per-session contextual views, not a partition.
   */
  observedSeconds: number;
}

/**
 * Compact per-session observation summaries for a batch of session ids.
 *
 * Each session contributes its own window (projected backwards from
 * durationSeconds when a historic resume bug shrank startedAt; unlike the
 * task activity read path, no extra 120s buffer is applied). Telemetry is
 * fetched once over the union range and then attributed per session by
 * EVIDENCE BLOCKS (Slice C): the pure builder slices the window atomically,
 * so an interval straddling a session boundary can never be captured by a
 * midpoint rule. Overlapping windows (possible only when the one-active
 * invariant was bypassed) may attribute a block twice; see
 * SessionObservedSummary. The rule is documented here rather than hidden.
 *
 * The output is strictly observational — application names and seconds.
 * No productivity labels, no coverage percentages: pause-interval history
 * is not retained precisely enough to support them.
 */
export async function getSessionsObservedActivity(
  userId: string,
  sessionIds: string[],
): Promise<Record<string, SessionObservedSummary>> {
  const empty: Record<string, SessionObservedSummary> = {};
  const ids = [...new Set(sessionIds)].slice(0, 50);
  if (ids.length === 0) return empty;

  const db = getDb();
  const sessions = await db.workSession.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true, startedAt: true, endedAt: true, durationSeconds: true },
  });
  if (sessions.length === 0) return empty;

  const windows = sessions.map((s) => {
    const end = s.endedAt ?? new Date();
    let start = s.startedAt;
    if (s.endedAt && s.durationSeconds) {
      const wallClockSec = Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 1000);
      if (wallClockSec < s.durationSeconds) {
        start = new Date(Math.min(s.startedAt.getTime(), s.endedAt.getTime() - s.durationSeconds * 1000));
      }
    }
    return { id: s.id, start, end };
  });

  const minStart = new Date(Math.min(...windows.map((w) => w.start.getTime())));
  const maxEnd = new Date(Math.max(...windows.map((w) => w.end.getTime())));

  const inputs = await loadEvidenceInputs(db, userId, { from: minStart, to: maxEnd });

  const result: Record<string, SessionObservedSummary> = {};
  for (const w of windows) {
    if (w.end.getTime() <= w.start.getTime()) {
      result[w.id] = { apps: [], observedSeconds: 0 };
      continue;
    }

    const evidence = buildEvidenceTimeline({
      windowStart: w.start,
      windowEnd: w.end,
      events: inputs.events,
      sessions: inputs.sessions,
      workContexts: inputs.workContexts,
      corrections: inputs.corrections,
      checkIns: inputs.checkIns,
      gapExplanations: inputs.gapExplanations,
    });

    let total = 0;
    const apps = new Map<string, number>();
    for (const block of evidence.blocks) {
      if (block.coverage !== "OBSERVED" && block.coverage !== "OBSERVED_REPORTED") continue;
      const observation = block.observation;
      if (!observation || observation.isAfk) continue;
      const durSec = Math.max(0, Math.round(block.durationSeconds));
      if (durSec < 1) continue;
      total += durSec;
      apps.set(observation.application, (apps.get(observation.application) ?? 0) + durSec);
    }

    result[w.id] = {
      apps: Array.from(apps.entries())
        .filter(([, secs]) => secs >= 5)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([app]) => app),
      observedSeconds: total,
    };
  }
  return result;
}
