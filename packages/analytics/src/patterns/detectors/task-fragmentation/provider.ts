import type { BaselinePopulationProvider, HistoricalWindow } from "../../baseline/source";
import type { TaskWithSessions, TemporalEvidenceBlock, EpisodeMeasurementOutput } from "@repo/types";
import type { Database } from "@repo/db";
import type {
  TaskExecutionBaselineEpisode,
  CurrentTaskEpisodesProvider,
  TaskExecutionFragmentationMetrics,
  TaskFragmentationConfig,
} from "./types";
import {
  isDifferentCalendarDay,
  isAuthoritativeTaskBlock,
  classifyInterveningBlock,
  findAuthoritativeTaskIds,
  segmentTaskExecutionEpisodes,
} from "./sequence";
import { safeDivide } from "../../shared/math";
import {
  PatternExecutionContext,
  type EpisodeExecutionContext,
  type DetectorConfiguration,
} from "../../base/context";
import { evaluateTaskFragmentationEpisode } from "./episode";

/**
 * Data source abstraction for fetching authoritative tasks and their work sessions,
 * and optionally historical evidence blocks.
 */
export interface TaskWorkSessionsDataSource {
  findTasksWithSessions(
    userId: string,
    startUTC: string,
    endUTC: string
  ): Promise<TaskWithSessions[]>;
  findEvidenceBlocks?(
    userId: string,
    startUTC: string,
    endUTC: string
  ): Promise<TemporalEvidenceBlock[]>;
}

export interface TaskExecutionBaselineProviderOptions {
  continuationGapThresholdSeconds?: number;
  timezone?: string;
  evidenceBlocks?: TemporalEvidenceBlock[];
}

/**
 * Production-ready BaselinePopulationProvider for Detector 2.
 * 
 * Derives bounded task execution episodes from authoritative Task + WorkSession data.
 * CRITICAL INVARIANT: Task rows ≠ execution episodes.
 * A single Task may have multiple execution episodes across calendar days or long gaps.
 * 
 * CANONICAL EPISTEMIC MODEL:
 * - Active execution comes only from authoritative task-linked sessions.
 * - An intervening gap is a KNOWN gap IF AND ONLY IF supported by authoritative evidence
 *   (e.g., another task session, explicit break, or explained gap).
 * - Absence of evidence between sessions is strictly UNKNOWN (missing telemetry / unobserved).
 * - Strict conservation invariant: wallClockSpan = active + knownGap + unknown.
 * - wallClockFragmentationRatio uses ONLY knownInterveningGapSeconds.
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
    const evidenceBlocks =
      this.options?.evidenceBlocks ??
      (this.dataSource.findEvidenceBlocks
        ? await this.dataSource.findEvidenceBlocks(userId, window.start, window.end)
        : undefined);

    const episodes: TaskExecutionBaselineEpisode[] = [];

    const windowStartMs = Date.parse(window.start);
    const windowEndMs = Date.parse(window.end);

    // Extract all sessions across all tasks to identify work on other tasks during gaps
    interface FlatSession {
      taskId: string;
      sessionId: string;
      startedAtMs: number;
      endedAtMs: number;
    }

    const allSessions: FlatSession[] = [];
    for (const t of tasks) {
      if (!t.sessions) continue;
      for (const s of t.sessions) {
        const sStartMs = Date.parse(s.startedAt);
        const sEndMs = s.endedAt
          ? Date.parse(s.endedAt)
          : sStartMs + (s.durationSeconds ?? 0) * 1000;
        if (sStartMs >= windowStartMs && sStartMs < windowEndMs) {
          allSessions.push({
            taskId: t.id,
            sessionId: s.id,
            startedAtMs: sStartMs,
            endedAtMs: sEndMs,
          });
        }
      }
    }

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

        const prevEndMs = prev.endedAt
          ? Date.parse(prev.endedAt)
          : Date.parse(prev.startedAt) + (prev.durationSeconds ?? 0) * 1000;
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
        const endedAt =
          lastSession.endedAt ??
          new Date(
            Date.parse(lastSession.startedAt) +
              (lastSession.durationSeconds ?? 0) * 1000
          ).toISOString();
        const wallClockSpanSeconds = Math.max(
          0,
          (Date.parse(endedAt) - Date.parse(startedAt)) / 1000
        );

        let activeTaskDurationSeconds = 0;
        for (const s of cluster) {
          const sStart = Date.parse(s.startedAt);
          const sEnd = s.endedAt
            ? Date.parse(s.endedAt)
            : sStart + (s.durationSeconds ?? 0) * 1000;
          activeTaskDurationSeconds +=
            s.durationSeconds ?? Math.max(0, (sEnd - sStart) / 1000);
        }

        let knownInterveningGapSeconds = 0;
        let unknownSeconds = 0;

        // Process intervening intervals between successive sessions.
        // Under the canonical ProductiveHix contract:
        // Absence of telemetry is UNKNOWN, not a known break.
        // An interval is a known gap IF AND ONLY IF supported by authoritative evidence.
        for (let j = 1; j < cluster.length; j++) {
          const prev = cluster[j - 1]!;
          const curr = cluster[j]!;
          const gapStartMs = prev.endedAt
            ? Date.parse(prev.endedAt)
            : Date.parse(prev.startedAt) + (prev.durationSeconds ?? 0) * 1000;
          const gapEndMs = Date.parse(curr.startedAt);

          if (gapEndMs <= gapStartMs) {
            continue;
          }

          if (evidenceBlocks && evidenceBlocks.length > 0) {
            // Case 1: Authoritative Phase-3 evidence blocks are available
            const blocksInGap = evidenceBlocks
              .filter((b) => {
                const bStartMs = Date.parse(b.startTime);
                const bEndMs = Date.parse(b.endTime);
                return (
                  bStartMs < gapEndMs &&
                  bEndMs > gapStartMs &&
                  !isAuthoritativeTaskBlock(b, task.id)
                );
              })
              .sort((a, b) => {
                const cmp = Date.parse(a.startTime) - Date.parse(b.startTime);
                if (cmp !== 0) return cmp;
                return a.id.localeCompare(b.id);
              });

            let cursorMs = gapStartMs;
            for (const b of blocksInGap) {
              const bStartMs = Date.parse(b.startTime);
              const bEndMs = Date.parse(b.endTime);

              const clampedStartMs = Math.max(gapStartMs, Math.max(cursorMs, bStartMs));
              const clampedEndMs = Math.min(gapEndMs, bEndMs);

              if (clampedStartMs > cursorMs) {
                // Unsupported interval with no evidence -> UNKNOWN!
                unknownSeconds += (clampedStartMs - cursorMs) / 1000;
                cursorMs = clampedStartMs;
              }

              if (clampedEndMs > cursorMs) {
                const dur = (clampedEndMs - cursorMs) / 1000;
                const { isKnown } = classifyInterveningBlock(b, task.id);
                if (isKnown) {
                  knownInterveningGapSeconds += dur;
                } else {
                  unknownSeconds += dur;
                }
                cursorMs = clampedEndMs;
              }
            }

            if (cursorMs < gapEndMs) {
              // Trailing unsupported gap -> UNKNOWN!
              unknownSeconds += (gapEndMs - cursorMs) / 1000;
            }
          } else {
            // Case 2: Derived from WorkSessions
            // An interval is a KNOWN gap IF and ONLY IF covered by an authoritative WorkSession
            // for another task. Missing/uncovered intervals are STRICTLY UNKNOWN.
            const otherSessionsInGap = allSessions
              .filter(
                (s) =>
                  s.taskId !== task.id &&
                  s.startedAtMs < gapEndMs &&
                  s.endedAtMs > gapStartMs
              )
              .sort((a, b) => {
                const cmp = a.startedAtMs - b.startedAtMs;
                if (cmp !== 0) return cmp;
                return a.sessionId.localeCompare(b.sessionId);
              });

            let cursorMs = gapStartMs;
            for (const otherS of otherSessionsInGap) {
              const clampedStartMs = Math.max(gapStartMs, Math.max(cursorMs, otherS.startedAtMs));
              const clampedEndMs = Math.min(gapEndMs, otherS.endedAtMs);

              if (clampedStartMs > cursorMs) {
                // Unsupported gap between sessions -> UNKNOWN
                unknownSeconds += (clampedStartMs - cursorMs) / 1000;
                cursorMs = clampedStartMs;
              }

              if (clampedEndMs > cursorMs) {
                // Authoritative work on another task -> KNOWN intervening gap
                knownInterveningGapSeconds += (clampedEndMs - cursorMs) / 1000;
                cursorMs = clampedEndMs;
              }
            }

            if (cursorMs < gapEndMs) {
              // Trailing unsupported gap -> UNKNOWN
              unknownSeconds += (gapEndMs - cursorMs) / 1000;
            }
          }
        }

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
 * Concrete data source abstraction for fetching authoritative Phase-3 evidence blocks.
 */
export interface AuthoritativeTimelineSource {
  getBlocks(
    userId: string,
    window: { start: string; end: string }
  ): Promise<TemporalEvidenceBlock[]>;
}

/**
 * Production-ready CurrentTaskEpisodesProvider backed by authoritative Phase-3 EvidenceTimeline.
 * Extracts distinct authoritative tasks and segments evidence into bounded execution episodes.
 */
export class TimelineTaskExecutionEpisodesProvider
  implements CurrentTaskEpisodesProvider<TaskExecutionFragmentationMetrics>
{
  constructor(
    private readonly timelineSource: AuthoritativeTimelineSource,
    private readonly config: TaskFragmentationConfig,
    private readonly options?: { timezone?: string }
  ) {}

  async fetchEpisodes(
    userId: string,
    window: { start: string; end: string }
  ): Promise<EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[]> {
    const blocks = await this.timelineSource.getBlocks(userId, window);
    if (!blocks || blocks.length === 0) {
      return [];
    }

    const taskIds = findAuthoritativeTaskIds(blocks);
    const results: EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[] = [];

    for (const taskId of taskIds) {
      const episodes = segmentTaskExecutionEpisodes(blocks, taskId, {
        timezone: this.options?.timezone ?? "UTC",
        continuationGapThresholdSeconds: this.config.continuationGapThresholdSeconds,
      });

      for (let i = 0; i < episodes.length; i++) {
        const ep = episodes[i]!;
        const epStartMs = Date.parse(ep.startedAt);
        const epEndMs = Date.parse(ep.endedAt);
        const episodeBlocks = blocks.filter((b) => {
          const bStartMs = Date.parse(b.startTime);
          const bEndMs = Date.parse(b.endTime);
          return bStartMs < epEndMs && bEndMs > epStartMs;
        });

        const fullConfig: DetectorConfiguration = {
          detectorIdentity: "task_execution_fragmentation",
          detectorVersion: "1.0.0",
          configurationVersion: "1.0.0",
          attributionMode: "TASK_LINKED",
          baselineStrategy: this.config.baselineStrategy ?? "ROLLING_14_DAY_WINDOW",
          sufficiency: {
            minimumQualifyingEpisodes: this.config.minimumQualifyingEpisodes,
            minimumDistinctCalendarDays: this.config.minimumQualifyingCalendarDays,
            minimumBaselineMaturityDays: this.config.minimumBaselineDays,
            requiredEvidenceQuality: {
              allowReportedOnly: false,
              allowExplainedGap: true,
              maxUnknownFraction: this.config.maxUnknownFraction,
            },
            unknownHandling: "INDETERMINATE_IF_EXCEEDED",
          },
          ...this.config,
        };

        const episodeContext = new PatternExecutionContext({
          userId,
          timezone: this.options?.timezone ?? "UTC",
          timeline: {
            windowStart: ep.startedAt,
            windowEnd: ep.endedAt,
            totalDurationSeconds: ep.wallClockSpanSeconds,
            blocks: episodeBlocks,
            coverageSummary: {
              totalDurationSeconds: ep.wallClockSpanSeconds,
              observedSeconds: ep.activeTaskDurationSeconds,
              reportedSeconds: 0,
              observedReportedSeconds: 0,
              unknownSeconds: ep.unknownSeconds,
              explainedGapSeconds: ep.gapBreakdown.explainedGapSeconds,
              coverageRatio: Math.max(0, Math.min(1, 1 - ep.unknownFraction)),
            },
          },
          config: fullConfig,
          level: "EPISODE",
          canonicalSessionId: `sess-${taskId}-${i}`,
          targetTaskId: taskId,
        });

        if (
          episodeContext.level === "EPISODE" &&
          typeof episodeContext.canonicalSessionId === "string"
        ) {
          const epContext: EpisodeExecutionContext = {
            ...episodeContext,
            level: "EPISODE",
            canonicalSessionId: episodeContext.canonicalSessionId,
            generateOperationalMetadata: () =>
              episodeContext.generateOperationalMetadata(),
          };
          const evaluation = evaluateTaskFragmentationEpisode(
            epContext,
            `eval-ep-${taskId}-${i}`,
            episodeBlocks,
            this.config,
            taskId
          );
          results.push(evaluation);
        }
      }
    }

    return results;
  }
}

/**
 * Custom fetcher-based CurrentTaskEpisodesProvider for Detector 2.
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
