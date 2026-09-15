import type { EpisodeDetector, PatternDetector } from "../../base/detector";
import type { EpisodeExecutionContext, PatternLevelExecutionContext } from "../../base/context";
import type { EpisodeMeasurementOutput, BehavioralPatternOutput } from "@repo/types";
import type { BaselinePopulationProvider } from "../../baseline/source";
import { evaluateTaskFragmentationEpisode } from "./episode";
import { evaluateTaskFragmentationPattern } from "./pattern";
import type {
  TaskFragmentationConfig,
  TaskExecutionFragmentationMetrics,
  TaskExecutionBaselineEpisode,
  TaskExecutionFragmentationPatternMetrics,
  CurrentTaskEpisodesProvider,
} from "./types";
import { subtractCalendarDays } from "../../qualification/temporal";

/**
 * Detector 2: Task Execution Fragmentation Detector
 * 
 * Measures whether execution of an explicit task is fractured across non-contiguous active blocks
 * in wall-clock time within a bounded task episode (Tier 1), and whether this forms a recurring pattern
 * compared to baseline (Tier 2).
 */
export class TaskFragmentationDetector
  implements
    EpisodeDetector<TaskExecutionFragmentationMetrics>,
    PatternDetector<TaskExecutionFragmentationPatternMetrics>
{
  constructor(
    private readonly config: TaskFragmentationConfig,
    private readonly currentEpisodesProvider: CurrentTaskEpisodesProvider<TaskExecutionFragmentationMetrics>,
    private readonly baselineProvider: BaselinePopulationProvider<TaskExecutionBaselineEpisode>
  ) {}

  public evaluateEpisode(
    context: EpisodeExecutionContext,
    evaluationId: string
  ): EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics> {
    return evaluateTaskFragmentationEpisode(
      context,
      evaluationId,
      context.timeline.blocks,
      this.config,
      context.targetTaskId
    );
  }

  public async evaluatePattern(
    context: PatternLevelExecutionContext,
    evaluationId: string,
    patternId: string
  ): Promise<BehavioralPatternOutput<TaskExecutionFragmentationPatternMetrics>> {
    // 1. Fetch current window episodes
    const currentEpisodes = await this.currentEpisodesProvider.fetchEpisodes(context.userId, {
      start: context.timeline.windowStart,
      end: context.timeline.windowEnd,
    });

    // 2. Fetch baseline historical episodes (strictly precedes evaluation start)
    const baselineWindowEnd = context.timeline.windowStart;
    const baselineWindowStart = subtractCalendarDays(
      baselineWindowEnd,
      this.config.minimumBaselineDays,
      context.timezone
    );

    const historicalEpisodes = await this.baselineProvider.fetchPopulation(context.userId, {
      start: baselineWindowStart,
      end: baselineWindowEnd,
    });

    // 3. Evaluate pattern
    return evaluateTaskFragmentationPattern(
      context,
      evaluationId,
      patternId,
      currentEpisodes,
      historicalEpisodes,
      this.config
    );
  }
}
