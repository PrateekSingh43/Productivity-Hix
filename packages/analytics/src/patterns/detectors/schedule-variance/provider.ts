import type { Database } from "@repo/db";
import type { CurrentTaskSchedulesProvider, TaskScheduleInstance } from "./types";

export interface TaskScheduleDataSource {
  findTasksWithSessions(
    userId: string,
    windowStart: string,
    windowEnd: string
  ): Promise<
    Array<{
      id: string;
      plannedStart?: Date | string | null;
      plannedCapturedAt?: Date | string | null;
      estimatedDurationMinutes?: number | null;
      sessions?: Array<{
        id: string;
        startedAt: Date | string;
        endedAt?: Date | string | null;
        durationSeconds?: number | null;
        telemetry?: unknown;
      }>;
    }>
  >;
}

/**
 * Loose task shape accepted by {@link collectScheduleInstances}.
 * `plannedStart` is authoritative plan data (stored field, never inferred);
 * Date values are serialized to ISO strings, null/undefined stays null.
 */
export interface SchedulableTaskInput {
  id: string;
  plannedStart?: Date | string | null;
  plannedCapturedAt?: Date | string | null;
  plannedDurationMinutes?: number | null;
}

/**
 * Loose session shape accepted by {@link collectScheduleInstances}.
 */
export interface SchedulableSessionInput {
  id: string;
  taskId?: string | null;
  startedAt: Date | string;
  endedAt?: Date | string | null;
  durationSeconds?: number | null;
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const iso = value instanceof Date ? value.toISOString() : value;
  return iso;
}

/**
 * Builds canonical {@link TaskScheduleInstance} values from stored tasks +
 * sessions (pure/deterministic, no I/O).
 *
 * Strict invariants:
 * - `plannedStart` is passed through verbatim from the task record — never
 *   inferred from session times, createdAt, or dueAt. Null stays null so the
 *   episode contract reports `NO_PLANNED_START` downstream.
 * - Window membership is clipped to the half-open `[start, end)` pattern
 *   window: a task is kept when its authoritative `plannedStart` falls inside
 *   OR it has at least one session starting inside; only in-window sessions
 *   are attached (no cross-window leakage, no lifetime backfill).
 * - Deterministic ordering: instances sort by plannedStart ASC (nulls last),
 *   then taskId ASC; sessions sort by startedAt ASC (invalid last), then id.
 */
export function collectScheduleInstances(
  tasks: SchedulableTaskInput[],
  sessions: SchedulableSessionInput[],
  window: { start: string; end: string },
): TaskScheduleInstance[] {
  const windowStartMs = Date.parse(window.start);
  const windowEndMs = Date.parse(window.end);

  const inWindow = (iso: string | null): boolean => {
    if (iso === null) return false;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) && ms >= windowStartMs && ms < windowEndMs;
  };

  const sessionIso = (s: SchedulableSessionInput): { id: string; startedAt: string; endedAt: string | null; durationSeconds: number | null } | null => {
    if (!s.id) return null;
    const startedAt = toIsoOrNull(s.startedAt);
    if (startedAt === null) return null;
    const endedAt = toIsoOrNull(s.endedAt ?? null);
    return {
      id: s.id,
      startedAt,
      endedAt,
      durationSeconds: typeof s.durationSeconds === "number" ? s.durationSeconds : null,
    };
  };

  const byTask = new Map<string, NonNullable<ReturnType<typeof sessionIso>>[]>();
  for (const session of sessions) {
    if (!session.taskId) continue;
    const item = sessionIso(session);
    if (!item) continue;
    if (!inWindow(item.startedAt)) continue;
    const list = byTask.get(session.taskId) ?? [];
    list.push(item);
    byTask.set(session.taskId, list);
  }
  for (const list of byTask.values()) {
    list.sort((a, b) => {
      const aMs = Date.parse(a.startedAt);
      const bMs = Date.parse(b.startedAt);
      const aValid = Number.isFinite(aMs);
      const bValid = Number.isFinite(bMs);
      if (aValid !== bValid) return aValid ? -1 : 1;
      if (aValid && aMs !== bMs) return aMs - bMs;
      return a.id.localeCompare(b.id);
    });
  }

  const instances: TaskScheduleInstance[] = [];
  for (const task of tasks) {
    if (!task.id) continue;
    const plannedStart = toIsoOrNull(task.plannedStart ?? null);
    const taskSessions = byTask.get(task.id) ?? [];
    if (plannedStart !== null && !inWindow(plannedStart) && taskSessions.length === 0) continue;
    if (plannedStart === null && taskSessions.length === 0) continue;
    instances.push({
      taskId: task.id,
      plannedStart,
      plannedCapturedAt: toIsoOrNull(task.plannedCapturedAt ?? null),
      plannedDurationMinutes: typeof task.plannedDurationMinutes === "number" ? task.plannedDurationMinutes : null,
      sessions: taskSessions,
    });
  }

  return instances.sort((a, b) => {
    if (a.plannedStart === null && b.plannedStart === null) return a.taskId.localeCompare(b.taskId);
    if (a.plannedStart === null) return 1;
    if (b.plannedStart === null) return -1;
    const aMs = Date.parse(a.plannedStart);
    const bMs = Date.parse(b.plannedStart);
    const aValid = Number.isFinite(aMs);
    const bValid = Number.isFinite(bMs);
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (aValid && aMs !== bMs) return aMs - bMs;
    return a.taskId.localeCompare(b.taskId);
  });
}

/**
 * Production Prisma-backed provider for Task Schedule Instances.
 * Fetches tasks scheduled within the evaluation window and their associated sessions.
 *
 * Strict Invariants:
 * - The pattern window is [start, end): BOTH plannedStart and session starts must fall
 *   inside it (clipped selection, no cross-window OR clause, no lifetime leakage).
 * - Sessions are clipped to the window; sessions overlapping the boundary contribute
 *   only their in-window portion (their start must still fall inside).
 * - plannedStart is preserved as-is (never backfilled or guessed from createdAt/dueAt).
 * - plannedCapturedAt, when the source exposes it, is passed through untouched as the
 *   as-of marker of the plan the user was operating under (M1 snapshots contract hook).
 * - Only genuine WorkSession instances are used for execution evidence.
 */
export class DatabaseTaskScheduleProvider implements CurrentTaskSchedulesProvider {
  constructor(private readonly db: Database) {}

  public async fetchTaskScheduleInstances(
    userId: string,
    window: { start: string; end: string }
  ): Promise<TaskScheduleInstance[]> {
    const windowStartMs = Date.parse(window.start);
    const windowEndMs = Date.parse(window.end);

    const tasks = await this.db.task.findMany({
      where: {
        userId,
        plannedStart: {
          gte: new Date(window.start),
          lt: new Date(window.end),
        },
      },
      include: {
        sessions: {
          orderBy: {
            startedAt: "asc",
          },
        },
      },
    });

    return tasks
      .map((task) => {
        const sessions = (task.sessions || [])
          .filter((s) => {
            const startMs = Date.parse(new Date(s.startedAt).toISOString());
            return startMs >= windowStartMs && startMs < windowEndMs;
          })
          .map((s) => {
            const startMs = Date.parse(new Date(s.startedAt).toISOString());
            const rawEndMs = s.endedAt ? Date.parse(new Date(s.endedAt).toISOString()) : null;
            const clippedEndMs = rawEndMs === null ? null : Math.min(rawEndMs, windowEndMs);
            const clippedStartMs = Math.max(startMs, windowStartMs);
            return {
              id: s.id,
              startedAt: new Date(clippedStartMs).toISOString(),
              endedAt: clippedEndMs === null ? null : new Date(clippedEndMs).toISOString(),
              durationSeconds:
                s.durationSeconds != null && rawEndMs === null
                  ? Math.max(0, Math.min(rawEndMs ?? startMs + s.durationSeconds * 1000, windowEndMs) - clippedStartMs) / 1000
                  : clippedEndMs !== null
                    ? Math.max(0, (clippedEndMs - clippedStartMs) / 1000)
                    : null,
              telemetry: undefined,
            };
          });
        return {
          taskId: task.id,
          plannedStart: task.plannedStart ? new Date(task.plannedStart).toISOString() : null,
          plannedCapturedAt: null,
          plannedDurationMinutes: task.plannedDurationMinutes ?? null,
          sessions,
        };
      })
      .filter(task => task.sessions.length > 0 || task.plannedStart !== null);
  }
}

/**
 * In-memory provider for test suites and offline analysis.
 */
export class InMemoryTaskScheduleProvider implements CurrentTaskSchedulesProvider {
  constructor(private readonly instances: TaskScheduleInstance[]) {}

  public async fetchTaskScheduleInstances(
    _userId: string,
    window: { start: string; end: string }
  ): Promise<TaskScheduleInstance[]> {
    const startMs = Date.parse(window.start);
    const endMs = Date.parse(window.end);
    return this.instances.filter(instance => {
      // Window membership is decided by plannedStart only — never by session presence
      // (that would re-introduce the cross-window OR clause / lifetime leakage).
      if (instance.plannedStart === null) return false;
      const plannedMs = Date.parse(instance.plannedStart);
      if (!Number.isFinite(plannedMs)) return false;
      return plannedMs >= startMs && plannedMs < endMs;
    });
  }
}
