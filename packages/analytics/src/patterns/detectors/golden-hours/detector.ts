import type { BehavioralPatternOutput } from "@repo/types";
import type { PatternDetector } from "../../base/detector";
import type { PatternLevelExecutionContext } from "../../base/context";
import type { BaselinePopulationProvider } from "../../baseline/source";
import { subtractCalendarDays } from "../../qualification/temporal";
import { evaluateGoldenHoursPattern } from "./pattern";
import type { GoldenHoursConfig, GoldenHoursDayEpisode, GoldenHoursPatternMetrics } from "./types";

export interface GoldenHoursDayEpisodesProvider {
  fetchDayEpisodes(userId: string, window: { start: string; end: string }): Promise<GoldenHoursDayEpisode[]>;
}

/**
 * Golden-hours focus detector (D5).
 *
 * Purpose: same provider-shaped shell as the other detectors. The pipeline
 * builds day-episodes directly from evidence via collectGoldenHoursDayEpisodes
 * (as D1 builds session episodes inline), so this class serves worker/API
 * consumers that supply pre-built day populations.
 */
export class GoldenHoursDetector implements PatternDetector<GoldenHoursPatternMetrics> {
  constructor(
    private readonly config: GoldenHoursConfig,
    private readonly currentEpisodesProvider: GoldenHoursDayEpisodesProvider,
    private readonly baselineProvider: BaselinePopulationProvider<GoldenHoursDayEpisode>,
  ) {}

  public async evaluatePattern(
    context: PatternLevelExecutionContext,
    evaluationId: string,
    patternId: string,
  ): Promise<BehavioralPatternOutput<GoldenHoursPatternMetrics>> {
    const current = await this.currentEpisodesProvider.fetchDayEpisodes(context.userId, {
      start: context.timeline.windowStart,
      end: context.timeline.windowEnd,
    });
    const baselineWindowEnd = context.timeline.windowStart;
    const baselineWindowStart = subtractCalendarDays(baselineWindowEnd, 30, context.timezone);
    const baseline = await this.baselineProvider.fetchPopulation(context.userId, {
      start: baselineWindowStart,
      end: baselineWindowEnd,
    });
    return evaluateGoldenHoursPattern(context, evaluationId, patternId, current, baseline, this.config);
  }
}
