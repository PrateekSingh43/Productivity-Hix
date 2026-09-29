import type { BehavioralPatternOutput, EpisodeMeasurementOutput } from "@repo/types";
import type { EpisodeDetector, PatternDetector } from "../../base/detector";
import type { EpisodeExecutionContext, PatternLevelExecutionContext } from "../../base/context";
import { evaluateEscapeHatchEpisode } from "./episode";
import { evaluateEscapeHatchPattern } from "./pattern";
import type {
  EscapeHatchConfig,
  EscapeHatchEpisodeInput,
  EscapeHatchEpisodeMetrics,
  EscapeHatchPatternMetrics,
} from "./types";

export interface EscapeHatchPopulationProvider {
  fetchTaskStarts(
    userId: string,
    window: { start: string; end: string },
  ): Promise<EscapeHatchEpisodeInput[]>;
}

/**
 * Escape-hatch detector (D7).
 *
 * Purpose: provider-shaped shell mirroring the other detectors. The pipeline
 * builds task onsets directly from sessions + evidence blocks (as D1 builds
 * session episodes inline), so this class serves worker/API consumers that
 * supply pre-built onset populations.
 */
export class EscapeHatchDetector
  implements EpisodeDetector<EscapeHatchEpisodeMetrics>, PatternDetector<EscapeHatchPatternMetrics>
{
  constructor(
    private readonly config: EscapeHatchConfig,
    private readonly currentProvider?: EscapeHatchPopulationProvider,
  ) {}

  public evaluateEpisode(
    context: EpisodeExecutionContext,
    evaluationId: string,
    input?: EscapeHatchEpisodeInput,
  ): EpisodeMeasurementOutput<EscapeHatchEpisodeMetrics> {
    const fallback: EscapeHatchEpisodeInput = input ?? {
      taskId: context.targetTaskId || "unspecified",
      session: { id: context.canonicalSessionId, startedAt: "", endedAt: null, durationSeconds: null },
      blocks: [],
    };
    return evaluateEscapeHatchEpisode(context, evaluationId, fallback, this.config);
  }

  public async evaluatePattern(
    context: PatternLevelExecutionContext,
    evaluationId: string,
    patternId: string,
  ): Promise<BehavioralPatternOutput<EscapeHatchPatternMetrics>> {
    const inputs = this.currentProvider
      ? await this.currentProvider.fetchTaskStarts(context.userId, {
          start: context.timeline.windowStart,
          end: context.timeline.windowEnd,
        })
      : [];
    const episodes = inputs.map((input, index) =>
      evaluateEscapeHatchEpisode(
        {
          ...context,
          level: "EPISODE",
          canonicalSessionId: input.session.id,
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
    return evaluateEscapeHatchPattern(context, evaluationId, patternId, episodes, this.config);
  }

  /** Synchronous helper to evaluate the pattern directly with provided episodes. */
  public evaluatePatternWithEpisodes(
    context: PatternLevelExecutionContext,
    evaluationId: string,
    patternId: string,
    episodes: EpisodeMeasurementOutput<EscapeHatchEpisodeMetrics>[],
  ): BehavioralPatternOutput<EscapeHatchPatternMetrics> {
    return evaluateEscapeHatchPattern(context, evaluationId, patternId, episodes, this.config);
  }
}
