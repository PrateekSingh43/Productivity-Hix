import type { TaskDataSource } from "./completed-tasks-adapter";
import type { TaskWithSessions, TaskStatus, TaskPriority } from "@repo/types";
import type { Database } from "@repo/db";

/**
 * Real repository-backed implementation of TaskDataSource.
 * Uses the existing Prisma Client to fetch authoritative tasks
 * for the Baseline CompletedTasksAdapter.
 */
export class PrismaTaskDataSource implements TaskDataSource {
  constructor(private readonly db: Database) {}

  async findCompletedTasks(userId: string, start: string, end: string): Promise<TaskWithSessions[]> {
    const tasks = await this.db.task.findMany({
      where: {
        userId,
        completedAt: {
          gte: new Date(start),
          lt: new Date(end),
        },
      },
      include: {
        sessions: {
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            durationSeconds: true,
            isPaused: true,
            lastResumedAt: true,
            notes: true,
          }
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
          }
        }
      }
    });

    return tasks.map(t => ({
      id: t.id,
      userId: t.userId,
      title: t.title,
      description: t.description,
      status: t.status as TaskStatus,
      priority: t.priority as TaskPriority,
      plannedDurationMinutes: t.plannedDurationMinutes ?? 30,
      dueAt: t.dueAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      goalId: t.goalId,
      productiveDate: t.productiveDate,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      sessions: t.sessions.map(s => ({
        id: s.id,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        durationSeconds: s.durationSeconds,
        isPaused: s.isPaused ?? false,
        lastResumedAt: s.lastResumedAt?.toISOString() ?? null,
        notes: s.notes
      })),
      checkIns: t.checkIns.map(c => ({
        id: c.id,
        activityAssessment: c.activityAssessment,
        alignment: c.alignment,
        energy: c.energy,
        focus: c.focus,
        note: c.note,
        outcome: c.outcome,
        blocker: c.blocker,
        createdAt: c.createdAt.toISOString()
      }))
    }));
  }
}
