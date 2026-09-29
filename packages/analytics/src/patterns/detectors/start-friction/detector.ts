import type { BehavioralPatternOutput, EpisodeMeasurementOutput } from "@repo/types";
import type { EpisodeDetector, PatternDetector } from "../../base/detector";
import type { EpisodeExecutionContext, PatternLevelExecutionContext } from "../../base/context";
import type { CurrentTaskSchedulesProvider, TaskScheduleInstance } from "../schedule-variance/types";
import { evaluateStartFrictionEpisode } from "./episode";
import { evaluateStartFrictionPattern } from "./pattern";
import type { StartFrictionConfig, StartFrictionEpisodeMetrics, StartFrictionPatternMetrics } from "./types";

/**
 * Start-friction detector (D6).
 *
 * Purpose: provider-shaped shell mirroring ScheduleVarianceDetector. The
 * pipeline builds schedule instances directly from tasks + sessions via
 * collectScheduleInstances (as D4 does), so this class serves worker/API
 * consumers that supply pre-built instance populations.
 */
export class StartFrictionDetector
  implements EpisodeDetector<StartFrictionEpisodeMetrics>, PatternDetector<StartFrictionPatternMetrics>
{
  constructor(
    private readonly config: StartFrictionConfig,
    private readonly schedulesProvider?: CurrentTaskSchedulesProvider,
  ) {}

  public evaluateEpisode(
    context: EpisodeExecutionContext,
    evaluationId: string,
  ): EpisodeMeasurementOutput<StartFrictionEpisodeMetrics> {
    const defaultInstance: TaskScheduleInstance = {
      taskId: context.targetTaskId || "unspecified",
      plannedStart: null,
      sessions: [],
    };
    return evaluateStartFrictionEpisode(context, evaluationId, defaultInstance, this.config);
  }

  public evaluateTaskInstance(
    context: EpisodeExecutionContext,
    evaluationId: string,
    taskInstance: TaskScheduleInstance,
  ): EpisodeMeasurementOutput<StartFrictionEpisodeMetrics> {
    return evaluateStartFrictionEpisode(context, evaluationId, taskInstance, this.config);
  }

  public async evaluatePattern(
    context: PatternLevelExecutionContext,
    evaluationId: string,
    patternId: string,
  ): Promise<BehavioralPatternOutput<StartFrictionPatternMetrics>> {
    let instances: TaskScheduleInstance[] = [];
    if (this.schedulesProvider) {
      instances = await this.schedulesProvider.fetchTaskScheduleInstances(context.userId, {
        start: context.timeline.windowStart,
        end: context.timeline.windowEnd,
      });
    }
    return evaluateStartFrictionPattern(context, evaluationId, patternId, instances, this.config);
  }

  /** Synchronous helper to evaluate the pattern directly with provided instances. */
  public evaluatePatternWithInstances(
    context: PatternLevelExecutionContext,
    evaluationId: string,
    patternId: string,
    instances: TaskScheduleInstance[],
  ): BehavioralPatternOutput<StartFrictionPatternMetrics> {
    return evaluateStartFrictionPattern(context, evaluationId, patternId, instances, this.config);
  }
}
