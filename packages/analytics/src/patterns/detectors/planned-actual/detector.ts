import type { BehavioralPatternOutput, EpisodeMeasurementOutput } from "@repo/types";
import type { EpisodeDetector, PatternDetector } from "../../base/detector";
import type { EpisodeExecutionContext, PatternLevelExecutionContext } from "../../base/context";
import { evaluatePlannedActualEpisode } from "./episode";
import { evaluatePlannedActualPattern } from "./pattern";
import type {
  PlannedActualConfig,
  PlannedActualEpisodeInput,
  PlannedActualEpisodeMetrics,
  PlannedActualPatternMetrics,
} from "./types";

export interface PlannedActualPopulationProvider {
  fetchCompletedTasks(
    userId: string,
    window: { start: string; end: string },
  ): Promise<PlannedActualEpisodeInput[]>;
}

/**
 * Planned-vs-actual detector (D8).
 *
 * Purpose: provider-shaped shell mirroring the other detectors. The pipeline
 * builds completed-task inputs directly from tasks + sessions (as D4 builds
 * schedule instances inline), so this class serves worker/API consumers that
 * supply pre-built completion populations.
 */
export class PlannedActualDetector
  implements EpisodeDetector<PlannedActualEpisodeMetrics>, PatternDetector<PlannedActualPatternMetrics>
{
  constructor(
    private readonly config: PlannedActualConfig,
    private readonly currentProvider?: PlannedActualPopulationProvider,
  ) {}

  public evaluateEpisode(
    context: EpisodeExecutionContext,
    evaluationId: string,
    input?: PlannedActualEpisodeInput,
  ): EpisodeMeasurementOutput<PlannedActualEpisodeMetrics> {
    const fallback: PlannedActualEpisodeInput = input ?? {
      taskId: context.targetTaskId || "unspecified",
      completedAt: null,
      plannedDurationMinutes: null,
      sessions: [],
    };
    return evaluatePlannedActualEpisode(context, evaluationId, fallback, this.config);
  }

  public async evaluatePattern(
    context: PatternLevelExecutionContext,
    evaluationId: string,
    patternId: string,
  ): Promise<BehavioralPatternOutput<PlannedActualPatternMetrics>> {
    const inputs = this.currentProvider
      ? await this.currentProvider.fetchCompletedTasks(context.userId, {
          start: context.timeline.windowStart,
          end: context.timeline.windowEnd,
        })
      : [];
    const episodes = inputs.map((input, index) =>
      evaluatePlannedActualEpisode(
        {
          ...context,
          level: "EPISODE",
          canonicalSessionId: input.sessions.map((session) => session.id).sort()[0] ?? "unspecified",
          targetTaskId: input.taskId,
          generateOperationalMetadata: () => ({
            detectorVersion: this.config.detectorVersion,
            configurationVersion: this.config.configurationVersion,
            generatedAt: new Date().toISOString(),
          }),
        } as EpisodeExecutionContext,
        `${evaluationId}:episode:${index}`,
        input,
        this.config,
      ),
    );
    return evaluatePlannedActualPattern(context, evaluationId, patternId, episodes, this.config);
  }

  /** Synchronous helper to evaluate the pattern directly with provided episodes. */
  public evaluatePatternWithEpisodes(
    context: PatternLevelExecutionContext,
    evaluationId: string,
    patternId: string,
    episodes: EpisodeMeasurementOutput<PlannedActualEpisodeMetrics>[],
  ): BehavioralPatternOutput<PlannedActualPatternMetrics> {
    return evaluatePlannedActualPattern(context, evaluationId, patternId, episodes, this.config);
  }
}
