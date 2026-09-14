import type { EpisodeExecutionContext } from "../../base/context";
import { createEpisodeResult } from "../../base/detector";
import { parseContextSequence } from "./sequence";
import { median, iqr } from "../../baseline/statistics";
import { safeDivide } from "../../shared/math";
import type { ContextSwitchingConfig, ContextSwitchingMetrics } from "./types";
import type { WorkSession, TemporalEvidenceBlock, EpisodeMeasurementOutput } from "@repo/types";

export function evaluateContextSwitchingEpisode(
  context: EpisodeExecutionContext,
  evaluationId: string,
  session: WorkSession,
  blocks: TemporalEvidenceBlock[],
  config: ContextSwitchingConfig
): EpisodeMeasurementOutput<ContextSwitchingMetrics> {
  const sequence = parseContextSequence(blocks);
  
  const activeHours = sequence.qualifyingObservedActiveDurationSeconds / 3600;
  
  let switchesPerHour: number | null = null;
  let executionStatus = "QUALIFIED" as any;
  
  // Calculate coverage for episode
  const coverageRatio = safeDivide(sequence.qualifyingObservedActiveDurationSeconds, session.durationSeconds ?? 0) ?? 0;
  
  // 1. Minimum active duration check
  if (sequence.qualifyingObservedActiveDurationSeconds < config.minimumEpisodeActiveDurationSeconds) {
    executionStatus = "INSUFFICIENT_EVIDENCE";
  }
  // 2. Minimum usable coverage check
  else if (coverageRatio < config.minimumUsableCoverageRatio) {
    executionStatus = "INDETERMINATE_COVERAGE";
  }
  // 3. Zero active duration fallback (guard against zero denominator)
  else if (activeHours <= 0) {
    executionStatus = "INSUFFICIENT_EVIDENCE";
  } else {
    switchesPerHour = sequence.switchCount / activeHours;
  }
  
  // Dwell calculations (Method-7)
  const medianDwell = median(sequence.dwellDurations);
  const iqrDwell = iqr(sequence.dwellDurations);
  
  // Short context fraction
  let shortContextFraction: number | null = null;
  if (sequence.dwellDurations.length > 0) {
    const shortDwells = sequence.dwellDurations.filter(d => d < config.shortContextThresholdSeconds).length;
    shortContextFraction = shortDwells / sequence.dwellDurations.length;
  }

  return createEpisodeResult<ContextSwitchingMetrics>(
    context,
    evaluationId,
    executionStatus,
    {
      taxonomy: "context_dynamics",
      temporalWindow: {
        start: session.startedAt,
        end: session.endedAt ?? session.startedAt,
        scale: "CONTINUOUS_INTERVAL"
      },
      episodeEvidence: {
        sessionId: session.id,
        taskId: session.taskId ?? undefined,
        boundingWindow: {
          start: session.startedAt,
          end: session.endedAt ?? session.startedAt
        }
      },
      activeDurationSeconds: sequence.qualifyingObservedActiveDurationSeconds,
      coverageRatio,
      metrics: {
        switchesPerHour,
        medianDwellSeconds: medianDwell,
        interquartileDwellSeconds: iqrDwell,
        shortContextFraction
      },
      epistemicCaveats: []
    }
  );
}
