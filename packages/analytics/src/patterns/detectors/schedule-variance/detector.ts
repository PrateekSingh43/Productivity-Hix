import type { EpisodeDetector, PatternDetector } from "../../base/detector";
import type { EpisodeExecutionContext, PatternLevelExecutionContext } from "../../base/context";
import type { EpisodeMeasurementOutput, BehavioralPatternOutput } from "@repo/types";
import { evaluateScheduleVarianceEpisode } from "./episode";
import { evaluateScheduleVariancePattern } from "./pattern";
import type {
  ScheduleVarianceConfig,
  ScheduleVarianceEpisodeMetrics,
  ScheduleVariancePatternMetrics,
  TaskScheduleInstance,
  CurrentTaskSchedulesProvider,
} from "./types";

/**
 * Detector 4: Schedule Variance Detector
 * 
 * Measures how far actual task execution starts from an authoritative planned task start (Tier 1),
 * and quantifies recurrence of delayed or punctual starts across multiple tasks (Tier 2).
 * 
 * Non-judgmental semantics:
 * - Does not label lateness as procrastination, distraction, or poor discipline.
 * - Quantifies signed start deviation and distributional statistics.
 */
export class ScheduleVarianceDetector
  implements
    EpisodeDetector<ScheduleVarianceEpisodeMetrics>,
    PatternDetector<ScheduleVariancePatternMetrics>
{
  constructor(
    private readonly config: ScheduleVarianceConfig,
    private readonly schedulesProvider?: CurrentTaskSchedulesProvider
  ) {}

  /**
   * Evaluates a single task schedule instance for Tier 1 Episode measurement.
   */
  public evaluateTaskInstance(
    context: EpisodeExecutionContext,
    evaluationId: string,
    taskInstance: TaskScheduleInstance
  ): EpisodeMeasurementOutput<ScheduleVarianceEpisodeMetrics> {
    return evaluateScheduleVarianceEpisode(
      context,
      evaluationId,
      taskInstance,
      this.config
    );
  }

  /**
   * Evaluates episode from context. If context does not carry a specific task instance,
   * evaluates against targetTaskId with no planned start (emitting INSUFFICIENT_EVIDENCE).
   */
  public evaluateEpisode(
    context: EpisodeExecutionContext,
    evaluationId: string
  ): EpisodeMeasurementOutput<ScheduleVarianceEpisodeMetrics> {
    const defaultInstance: TaskScheduleInstance = {
      taskId: context.targetTaskId || "unspecified",
      plannedStart: null,
      sessions: [],
    };
    return evaluateScheduleVarianceEpisode(
      context,
      evaluationId,
      defaultInstance,
      this.config
    );
  }

  /**
   * Evaluates recurring schedule variance pattern across task instances in window (Tier 2).
   */
  public async evaluatePattern(
    context: PatternLevelExecutionContext,
    evaluationId: string,
    patternId: string
  ): Promise<BehavioralPatternOutput<ScheduleVariancePatternMetrics>> {
    let instances: TaskScheduleInstance[] = [];
    if (this.schedulesProvider) {
      instances = await this.schedulesProvider.fetchTaskScheduleInstances(
        context.userId,
        {
          start: context.timeline.windowStart,
          end: context.timeline.windowEnd,
        }
      );
    }

    return evaluateScheduleVariancePattern(
      context,
      evaluationId,
      patternId,
      instances,
      this.config
    );
  }

  /**
   * Synchronous helper to evaluate pattern directly with provided task schedule instances.
   */
  public evaluatePatternWithInstances(
    context: PatternLevelExecutionContext,
    evaluationId: string,
    patternId: string,
    instances: TaskScheduleInstance[]
  ): BehavioralPatternOutput<ScheduleVariancePatternMetrics> {
    return evaluateScheduleVariancePattern(
      context,
      evaluationId,
      patternId,
      instances,
      this.config
    );
  }
}
