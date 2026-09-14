import type { EpisodeDetector, PatternDetector } from "../../base/detector";
import type { EpisodeExecutionContext, PatternLevelExecutionContext } from "../../base/context";
import type { EpisodeMeasurementOutput, BehavioralPatternOutput, WorkSession } from "@repo/types";
import type { BaselinePopulationProvider } from "../../baseline/source";
import { evaluateContextSwitchingEpisode } from "./episode";
import { evaluateContextSwitchingPattern } from "./pattern";
import type { ContextSwitchingConfig, ContextSwitchingMetrics } from "./types";

export interface CurrentEpisodesProvider<TMetrics> {
  fetchEpisodes(userId: string, window: { start: string; end: string }): Promise<EpisodeMeasurementOutput<TMetrics>[]>;
}

export class ContextSwitchingDetector implements EpisodeDetector<ContextSwitchingMetrics>, PatternDetector<ContextSwitchingMetrics> {
  constructor(
    private readonly config: ContextSwitchingConfig,
    private readonly currentEpisodesProvider: CurrentEpisodesProvider<ContextSwitchingMetrics>,
    private readonly baselineProvider: BaselinePopulationProvider<WorkSession & { switchesPerHour: number | null }>
  ) {}

  public evaluateEpisode(
    context: EpisodeExecutionContext,
    evaluationId: string
  ): EpisodeMeasurementOutput<ContextSwitchingMetrics> {
    const session: WorkSession = {
      id: "ep-" + context.timeline.windowStart,
      userId: context.userId,
      startedAt: context.timeline.windowStart,
      endedAt: context.timeline.windowEnd,
      durationSeconds: context.timeline.totalDurationSeconds,
      source: "derived"
    };

    return evaluateContextSwitchingEpisode(
      context,
      evaluationId,
      session,
      context.timeline.blocks,
      this.config
    );
  }

  public async evaluatePattern(
    context: PatternLevelExecutionContext,
    evaluationId: string,
    patternId: string
  ): Promise<BehavioralPatternOutput<ContextSwitchingMetrics>> {
    // 1. Fetch evaluated current window episodes
    const currentEpisodes = await this.currentEpisodesProvider.fetchEpisodes(context.userId, {
      start: context.timeline.windowStart,
      end: context.timeline.windowEnd
    });

    // 2. Fetch baseline historical sessions
    // Baseline window is [D-43, D-13)
    const baselineWindowEnd = context.timeline.windowStart;
    const baselineWindowStart = this.getDaysAgo(baselineWindowEnd, 30);
    const historicalSessions = await this.baselineProvider.fetchPopulation(context.userId, {
      start: baselineWindowStart,
      end: baselineWindowEnd
    });

    return evaluateContextSwitchingPattern(
      context,
      evaluationId,
      patternId,
      currentEpisodes,
      historicalSessions,
      this.config
    );
  }

  private getDaysAgo(dateString: string, days: number): string {
    const d = new Date(dateString);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString();
  }
}
