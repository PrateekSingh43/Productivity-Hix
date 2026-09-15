import type { BaselinePopulationProvider, HistoricalWindow } from "../../baseline/source";
import type { TaskWithSessions } from "@repo/types";
import type { Database } from "@repo/db";
import type {
  TaskExecutionBaselineEpisode,
  CurrentTaskEpisodesProvider,
  TaskExecutionFragmentationMetrics,
} from "./types";
import type { EpisodeMeasurementOutput } from "@repo/types";
import { isDifferentCalendarDay } from "./sequence";
import { safeDivide } from "../../shared/math";

/**
 * Data source abstraction for fetching authoritative tasks and their work sessions.
 */
export interface TaskWorkSessionsDataSource {
  findTasksWithSessions(
    userId: string,
    startUTC: string,
    endUTC: string
  ): Promise<TaskWithSessions[]>;
}

export interface TaskExecutionBaselineProviderOptions {
  continuationGapThresholdSeconds?: number;
  timezone?: string;
}

/**
 * Production-ready BaselinePopulationProvider for Detector 2.
 * 
 * Derives bounded task execution episodes from authoritative Task + WorkSession data.
 * CRITICAL INVARIANT: Task rows ≠ execution episodes.
 * A single Task may have multiple execution episodes across calendar days or long gaps.
 * Enforces [start, end) half-open boundary and user isolation.
 */
export class TaskExecutionBaselineProvider
  implements BaselinePopulationProvider<TaskExecutionBaselineEpisode>
{
  readonly populationType = "completed_task_episodes";

  constructor(
    private readonly dataSource: TaskWorkSessionsDataSource,
    private readonly options?: TaskExecutionBaselineProviderOptions
  ) {}

  async fetchPopulation(
    userId: string,
    window: HistoricalWindow
  ): Promise<TaskExecutionBaselineEpisode[]> {
    const continuationThreshold = this.options?.continuationGapThresholdSeconds ?? 7200;
    const timezone = this.options?.timezone ?? "UTC";

    const tasks = await this.dataSource.findTasksWithSessions(userId, window.start, window.end);
    const episodes: TaskExecutionBaselineEpisode[] = [];

    const windowStartMs = Date.parse(window.start);
    const windowEndMs = Date.parse(window.end);

    for (const task of tasks) {
      if (!task.sessions || task.sessions.length === 0) {
        continue;
      }

      // Filter and sort sessions strictly within [window.start, window.end)
      const validSessions = task.sessions
        .filter((s) => {
          const sStartMs = Date.parse(s.startedAt);
          return sStartMs >= windowStartMs && sStartMs < windowEndMs;
        })
        .sort((a, b) => {
          const startCmp = Date.parse(a.startedAt) - Date.parse(b.startedAt);
          if (startCmp !== 0) return startCmp;
          return a.id.localeCompare(b.id);
        });

      if (validSessions.length === 0) {
        continue;
      }

      // Cluster sessions into bounded execution episodes using state machine rules
      type SessionItem = (typeof validSessions)[number];
      const clusters: SessionItem[][] = [];
      let currentCluster: SessionItem[] = [validSessions[0]!];

      for (let i = 1; i < validSessions.length; i++) {
        const prev = validSessions[i - 1]!;
        const curr = validSessions[i]!;

        const prevEndMs = prev.endedAt ? Date.parse(prev.endedAt) : Date.parse(prev.startedAt);
        const currStartMs = Date.parse(curr.startedAt);
        const gapSeconds = Math.max(0, (currStartMs - prevEndMs) / 1000);

        const isDayCrossed = isDifferentCalendarDay(
          prev.endedAt ?? prev.startedAt,
          curr.startedAt,
          timezone
        );

        if (gapSeconds > continuationThreshold || isDayCrossed) {
          clusters.push(currentCluster);
          currentCluster = [curr];
        } else {
          currentCluster.push(curr);
        }
      }
      clusters.push(currentCluster);

      // Build TaskExecutionBaselineEpisode for each cluster
      for (const cluster of clusters) {
        const firstSession = cluster[0]!;
        const lastSession = cluster[cluster.length - 1]!;

        const startedAt = firstSession.startedAt;
        const endedAt = lastSession.endedAt ?? lastSession.startedAt;
        const wallClockSpanSeconds = Math.max(
          0,
          (Date.parse(endedAt) - Date.parse(startedAt)) / 1000
        );

        let activeTaskDurationSeconds = 0;
        for (const s of cluster) {
          activeTaskDurationSeconds += s.durationSeconds ?? 0;
        }

        let knownInterveningGapSeconds = 0;
        for (let j = 1; j < cluster.length; j++) {
          const p = cluster[j - 1]!;
          const c = cluster[j]!;
          const pEnd = p.endedAt ? Date.parse(p.endedAt) : Date.parse(p.startedAt);
          const cStart = Date.parse(c.startedAt);
          knownInterveningGapSeconds += Math.max(0, (cStart - pEnd) / 1000);
        }

        // Uncovered time inside the bounding span is unknown
        const unknownSeconds = Math.max(
          0,
          wallClockSpanSeconds - (activeTaskDurationSeconds + knownInterveningGapSeconds)
        );

        const unknownFraction =
          wallClockSpanSeconds > 0
            ? (safeDivide(unknownSeconds, wallClockSpanSeconds) ?? 0)
            : 0;

        const wallClockFragmentationRatio =
          wallClockSpanSeconds > 0
            ? (safeDivide(knownInterveningGapSeconds, wallClockSpanSeconds) ?? 0)
            : 0;

        const coverageRatio = Math.max(0, Math.min(1, 1 - unknownFraction));

        episodes.push({
          episodeId: `base-ep-${task.id}-${firstSession.id}`,
          taskId: task.id,
          userId,
          startedAt,
          endedAt,
          wallClockSpanSeconds,
          activeTaskDurationSeconds,
          knownInterveningGapSeconds,
          unknownSeconds,
          unknownFraction,
          wallClockFragmentationRatio,
          fragmentCount: cluster.length,
          coverageRatio,
        });
      }
    }

    return episodes;
  }
}

/**
 * Real repository-backed implementation of TaskWorkSessionsDataSource using Prisma.
 */
export class PrismaTaskWorkSessionsDataSource implements TaskWorkSessionsDataSource {
  constructor(private readonly db: Database) {}

  async findTasksWithSessions(
    userId: string,
    startUTC: string,
    endUTC: string
  ): Promise<TaskWithSessions[]> {
    const tasks = await this.db.task.findMany({
      where: {
        userId,
        sessions: {
          some: {
            startedAt: {
              gte: new Date(startUTC),
              lt: new Date(endUTC),
            },
          },
        },
      },
      include: {
        sessions: {
          where: {
            startedAt: {
              gte: new Date(startUTC),
              lt: new Date(endUTC),
            },
          },
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            durationSeconds: true,
            isPaused: true,
            lastResumedAt: true,
            notes: true,
          },
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
          },
        },
      },
    });

    return tasks.map((t) => ({
      id: t.id,
      userId: t.userId,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority as TaskWithSessions["priority"],
      plannedDurationMinutes: t.plannedDurationMinutes ?? 30,
      dueAt: t.dueAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      goalId: t.goalId,
      productiveDate: t.productiveDate,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      sessions: t.sessions.map((s) => ({
        id: s.id,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        durationSeconds: s.durationSeconds,
        isPaused: s.isPaused ?? false,
        lastResumedAt: s.lastResumedAt?.toISOString() ?? null,
        notes: s.notes,
      })),
      checkIns: t.checkIns.map((c) => ({
        id: c.id,
        activityAssessment: c.activityAssessment,
        alignment: c.alignment,
        energy: c.energy,
        focus: c.focus,
        note: c.note,
        outcome: c.outcome,
        blocker: c.blocker,
        createdAt: c.createdAt.toISOString(),
      })),
    }));
  }
}

/**
 * Production-ready CurrentTaskEpisodesProvider for Detector 2.
 */
export class TaskExecutionEpisodesProvider
  implements CurrentTaskEpisodesProvider<TaskExecutionFragmentationMetrics>
{
  constructor(
    private readonly fetcher: (
      userId: string,
      window: { start: string; end: string }
    ) => Promise<EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[]>
  ) {}

  async fetchEpisodes(
    userId: string,
    window: { start: string; end: string }
  ): Promise<EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[]> {
    return this.fetcher(userId, window);
  }
}
