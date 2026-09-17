import type {
  EpisodeMeasurementOutput,
  EpisodeExecutionStatus,
  TemporalEvidenceBlock,
} from "@repo/types";
import type { EpisodeExecutionContext } from "../../base/context";
import { createEpisodeResult } from "../../base/detector";
import { safeDivide } from "../../shared/math";
import type { ContinuousActivityConfig, ContinuousActivityMetrics } from "./types";
import { segmentContinuousActivityRuns, isValidTemporalBlock } from "./sequence";

/**
 * Evaluates a single bounded continuous activity episode for Detector 3.
 * 
 * Strict invariants:
 * - Operates exclusively at Tier 1 (Episode level).
 * - Measurement is decoupled from qualification (metrics reflect actual continuous duration even if NOT_QUALIFIED).
 * - UNKNOWN is never converted to continuous activity.
 * - All divisions guarded against division by zero.
 */
export function evaluateContinuousActivityEpisode(
  context: EpisodeExecutionContext,
  evaluationId: string,
  blocks: TemporalEvidenceBlock[],
  config: ContinuousActivityConfig
): EpisodeMeasurementOutput<ContinuousActivityMetrics> {
  const windowStartMs = Date.parse(context.timeline.windowStart);
  const windowEndMs = Date.parse(context.timeline.windowEnd);
  const totalWindowSpanSeconds = Math.max(0, (windowEndMs - windowStartMs) / 1000);

  const validBlocks = blocks.filter(isValidTemporalBlock).flatMap(block => {
    const start = Math.max(windowStartMs, Date.parse(block.startTime));
    const end = Math.min(windowEndMs, Date.parse(block.endTime));
    return end > start ? [{ ...block, startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), durationSeconds: (end - start) / 1000 }] : [];
  });

  const unknownBlocks = validBlocks.filter(b => b.coverage === "UNKNOWN")
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  let unknownSeconds = 0;
  let unknownEnd = windowStartMs;
  for (const block of unknownBlocks) {
    const start = Math.max(unknownEnd, Date.parse(block.startTime));
    const end = Date.parse(block.endTime);
    unknownSeconds += Math.max(0, end - start) / 1000;
    unknownEnd = Math.max(unknownEnd, end);
  }

  const unknownFraction = totalWindowSpanSeconds > 0
    ? (safeDivide(unknownSeconds, totalWindowSpanSeconds) ?? 0)
    : 0;

  // Segment evidence into continuous runs
  const runs = segmentContinuousActivityRuns(validBlocks, config, context.timeline.windowEnd);

  if (runs.length === 0) {
    return createEpisodeResult<ContinuousActivityMetrics>(
      context,
      evaluationId,
      "INSUFFICIENT_EVIDENCE",
      {
        taxonomy: "sustained_effort",
        temporalWindow: {
          start: context.timeline.windowStart,
          end: context.timeline.windowEnd,
          scale: "CONTINUOUS_INTERVAL",
        },
        episodeEvidence: {
          sessionId: context.canonicalSessionId,
          boundingWindow: {
            start: context.timeline.windowStart,
            end: context.timeline.windowEnd,
          },
        },
        activeDurationSeconds: 0,
        coverageRatio: 0,
        metrics: {
          evaluationWindowSeconds: totalWindowSpanSeconds,
          blockIds: [],
          unknownFraction,
          runCount: 0,
          continuousDurationSeconds: 0,
          observedDurationSeconds: 0,
          interruptionCount: 0,
          longestObservedRunSeconds: 0,
          coverageRatio: 0,
          contextConcentrationRatio: null,
        },
        epistemicCaveats: ["NO_QUALIFYING_OBSERVED_ACTIVITY"],
      }
    );
  }

  // Identify the longest continuous run
  const sortedRuns = [...runs].sort(
    (a, b) => b.continuousDurationSeconds - a.continuousDurationSeconds
  );
  const primaryRun = sortedRuns[0]!;

  const continuousDurationSeconds = primaryRun.continuousDurationSeconds;
  const observedDurationSeconds = primaryRun.observedDurationSeconds;
  const longestObservedRunSeconds = primaryRun.continuousDurationSeconds;
  const interruptionCount = runs.length - 1;

  const coverageRatio = totalWindowSpanSeconds > 0
    ? Math.max(0, Math.min(1, safeDivide(observedDurationSeconds, totalWindowSpanSeconds) ?? 0))
    : 0;

  // Qualification decision
  let executionStatus: EpisodeExecutionStatus = "NOT_QUALIFIED";
  const caveats: string[] = [];

  if (unknownFraction > config.maxUnknownFraction) {
    executionStatus = "INDETERMINATE_COVERAGE";
    caveats.push("UNKNOWN_COVERAGE_EXCEEDS_TOLERANCE");
  } else if (coverageRatio < config.minimumCoverageRatio) {
    executionStatus = "INDETERMINATE_COVERAGE";
    caveats.push("OBSERVED_COVERAGE_BELOW_MINIMUM");
  } else if (continuousDurationSeconds >= config.minimumEpisodeDurationSeconds) {
    executionStatus = "QUALIFIED";
  } else {
    executionStatus = "NOT_QUALIFIED";
  }

  if (primaryRun.isOpenInterval) {
    caveats.push("OPEN_CURRENT_INTERVAL");
  }

  return createEpisodeResult<ContinuousActivityMetrics>(
    context,
    evaluationId,
    executionStatus,
    {
      taxonomy: "sustained_effort",
      temporalWindow: {
        start: primaryRun.startTime,
        end: primaryRun.endTime,
        scale: "CONTINUOUS_INTERVAL",
      },
      episodeEvidence: {
        sessionId: context.canonicalSessionId,
        boundingWindow: {
          start: primaryRun.startTime,
          end: primaryRun.endTime,
        },
      },
      activeDurationSeconds: observedDurationSeconds,
      coverageRatio,
      metrics: {
        evaluationWindowSeconds: totalWindowSpanSeconds,
        blockIds: [...new Set(validBlocks.filter(b => primaryRun.blockIds.includes(b.id) && Date.parse(b.startTime) < Date.parse(primaryRun.endTime) && Date.parse(b.endTime) > Date.parse(primaryRun.startTime)).map(b => b.id))].sort(),
        unknownFraction,
        runCount: runs.length,
        continuousDurationSeconds,
        observedDurationSeconds,
        interruptionCount,
        longestObservedRunSeconds,
        coverageRatio,
        contextConcentrationRatio: null,
      },
      epistemicCaveats: caveats,
    }
  );
}
