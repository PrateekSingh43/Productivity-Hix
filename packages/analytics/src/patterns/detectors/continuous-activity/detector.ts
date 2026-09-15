import type { EpisodeDetector } from "../../base/detector";
import type { EpisodeExecutionContext } from "../../base/context";
import type { EpisodeMeasurementOutput } from "@repo/types";
import { evaluateContinuousActivityEpisode } from "./episode";
import type { ContinuousActivityConfig, ContinuousActivityMetrics } from "./types";

/**
 * Detector 3: Extended Continuous Observed Activity Detector
 * 
 * Measures a single bounded interval of sustained, continuously observed physical activity.
 * Operates strictly at Tier 1 (Episode Detector).
 * 
 * Non-judgmental semantics:
 * - Does not evaluate productivity, quality, or psychological state.
 * - Slices and merges observed physical activity according to configured continuity tolerances.
 */
export class ContinuousActivityDetector implements EpisodeDetector<ContinuousActivityMetrics> {
  constructor(private readonly config: ContinuousActivityConfig) {}

  public evaluateEpisode(
    context: EpisodeExecutionContext,
    evaluationId: string
  ): EpisodeMeasurementOutput<ContinuousActivityMetrics> {
    return evaluateContinuousActivityEpisode(
      context,
      evaluationId,
      context.timeline.blocks,
      this.config
    );
  }
}
