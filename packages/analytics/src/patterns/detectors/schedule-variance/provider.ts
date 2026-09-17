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
