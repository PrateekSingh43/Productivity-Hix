import type { 
  EpisodeMeasurementOutput, 
  BehavioralPatternOutput,
  EpisodeExecutionStatus,
  PatternExecutionStatus
} from "@repo/types";
import type { EpisodeExecutionContext, PatternLevelExecutionContext } from "./context";

/**
 * Base abstraction for Episode-level detectors (Tier 1).
 * Can never emit PatternExecutionStatus.
 */
export interface EpisodeDetector<TMetrics = Record<string, unknown>> {
  /**
   * Evaluates a single bounded episode and returns Tier 1 measurement output.
   * Enforces that the execution level is "EPISODE".
   */
  evaluateEpisode(
    context: EpisodeExecutionContext,
    evaluationId: string
  ): EpisodeMeasurementOutput<TMetrics>;
}

/**
 * Base abstraction for Pattern-level detectors (Tier 2).
 * Can never emit EpisodeExecutionStatus.
 */
export interface PatternDetector<TMetrics = Record<string, unknown>> {
  /**
   * Evaluates a temporal window across a population of episodes/tasks and returns Tier 2 pattern output.
   * Enforces that the execution level is "PATTERN".
   */
  evaluatePattern(
    context: PatternLevelExecutionContext,
    evaluationId: string,
    patternId: string
  ): BehavioralPatternOutput<TMetrics>;
}

/**
 * Helper to ensure a status intended for an Episode cannot leak into a Pattern result,
 * or vice versa, at the type level. The generic constraints enforce this structural safety.
 */
export function createEpisodeResult<TMetrics>(
  context: EpisodeExecutionContext,
  evaluationId: string,
  status: EpisodeExecutionStatus,
  overrides: Omit<EpisodeMeasurementOutput<TMetrics>, "metadata" | "userId" | "detectorIdentity" | "executionStatus" | "level" | "attributionMode">
): EpisodeMeasurementOutput<TMetrics> {
  if (context.level !== "EPISODE") {
    throw new Error("Cannot create Episode result from a non-EPISODE context");
  }
  
  return {
    metadata: {
      evaluationId,
      ...context.generateOperationalMetadata(),
    },
    userId: context.userId,
    detectorIdentity: context.config.detectorIdentity,
    executionStatus: status,
    level: "EPISODE",
    attributionMode: context.config.attributionMode,
    ...overrides,
  };
}

export function createPatternResult<TMetrics>(
  context: PatternLevelExecutionContext,
  evaluationId: string,
  patternId: string,
  status: PatternExecutionStatus,
  overrides: Omit<BehavioralPatternOutput<TMetrics>, "metadata" | "userId" | "executionStatus" | "level" | "attributionMode">
): BehavioralPatternOutput<TMetrics> {
  if (context.level !== "PATTERN") {
    throw new Error("Cannot create Pattern result from a non-PATTERN context");
  }

  return {
    metadata: {
      evaluationId,
      patternId,
      ...context.generateOperationalMetadata(),
    },
    userId: context.userId,
    executionStatus: status,
    level: "PATTERN",
    attributionMode: context.config.attributionMode,
    ...overrides,
  }; 
}
