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
      estimatedDurationMinutes?: number | null;
      sessions?: Array<{
        id: string;
        startedAt: Date | string;
        endedAt?: Date | string | null;
        durationSeconds?: number | null;
      }>;
    }>
  >;
}

/**
 * Production Prisma-backed provider for Task Schedule Instances.
 * Fetches tasks scheduled within the evaluation window and their associated sessions.
 * 
 * Strict Invariants:
 * - plannedStart is preserved as-is (never backfilled or guessed from createdAt/dueAt).
 * - Only genuine WorkSession instances are used for execution evidence.
 */
export class DatabaseTaskScheduleProvider implements CurrentTaskSchedulesProvider {
  constructor(private readonly db: Database) {}

  public async fetchTaskScheduleInstances(
    userId: string,
    window: { start: string; end: string }
  ): Promise<TaskScheduleInstance[]> {
    const tasks = await this.db.task.findMany({
      where: {
        userId,
        // Fetch tasks whose plannedStart falls in window, or tasks created/updated in window if plannedStart is null
        OR: [
          {
            plannedStart: {
              gte: new Date(window.start),
              lt: new Date(window.end),
            },
          },
          {
            sessions: {
              some: {
                startedAt: {
                  gte: new Date(window.start),
                  lt: new Date(window.end),
                },
              },
            },
          },
        ],
      },
      include: {
        sessions: {
          orderBy: {
            startedAt: "asc",
          },
        },
      },
    });

    return tasks.map((task) => ({
      taskId: task.id,
      plannedStart: task.plannedStart ? new Date(task.plannedStart).toISOString() : null,
      plannedDurationMinutes: task.plannedDurationMinutes ?? null,
      sessions: (task.sessions || []).map((s) => ({
        id: s.id,
        startedAt: new Date(s.startedAt).toISOString(),
        endedAt: s.endedAt ? new Date(s.endedAt).toISOString() : null,
        durationSeconds: s.durationSeconds ?? null,
      })),
    }));
  }
}

/**
 * In-memory provider for test suites and offline analysis.
 */
export class InMemoryTaskScheduleProvider implements CurrentTaskSchedulesProvider {
  constructor(private readonly instances: TaskScheduleInstance[]) {}

  public async fetchTaskScheduleInstances(
    _userId: string,
    _window: { start: string; end: string }
  ): Promise<TaskScheduleInstance[]> {
    return [...this.instances];
  }
}
