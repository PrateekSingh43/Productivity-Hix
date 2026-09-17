import type { TemporalEvidenceBlock, PatternSufficiency } from "@repo/types";
import { safeRatio } from "../shared/math";

/**
 * Validates the evidence coverage of an episode or pattern against the UNKNOWN handling strategy.
 */

export interface CoverageAssessment {
  totalDurationSeconds: number;
  usableObservedSeconds: number;
  usableReportedSeconds: number;
  explainedGapSeconds: number;
  unknownSeconds: number;
  unknownFraction: number;
  isCoverageSufficient: boolean;
  status: "SUFFICIENT" | "INDETERMINATE_COVERAGE" | "INTERRUPTED" | "TERMINATED";
}

/**
 * Assesses coverage over a series of sequential evidence blocks.
 * Applies the explicitly configured UNKNOWN handling strategy.
 */
export function assessCoverage(
  blocks: TemporalEvidenceBlock[],
  config: PatternSufficiency
): CoverageAssessment {
  let totalDurationSeconds = 0;
  let usableObservedSeconds = 0;
  let usableReportedSeconds = 0;
  let explainedGapSeconds = 0;
  let unknownSeconds = 0;

  let interrupted = false;
  let terminated = false;

  for (const block of blocks) {
    if (terminated) break;

    totalDurationSeconds += block.durationSeconds;

    if (block.coverage === "OBSERVED" || block.coverage === "OBSERVED_REPORTED") {
      usableObservedSeconds += block.durationSeconds;
    } else if (block.coverage === "REPORTED") {
      if (config.requiredEvidenceQuality.allowReportedOnly) {
        usableReportedSeconds += block.durationSeconds;
      } else {
        // If reported-only is not allowed, it acts as unknown
        unknownSeconds += block.durationSeconds;
      }
    } else if (block.coverage === "EXPLAINED_GAP") {
      if (config.requiredEvidenceQuality.allowExplainedGap) {
        explainedGapSeconds += block.durationSeconds;
      } else {
        unknownSeconds += block.durationSeconds;
      }
    } else if (block.coverage === "UNKNOWN") {
      unknownSeconds += block.durationSeconds;
    }

    const isUnknownEquivalent = block.coverage === "UNKNOWN" ||
      (block.coverage === "REPORTED" && !config.requiredEvidenceQuality.allowReportedOnly) ||
      (block.coverage === "EXPLAINED_GAP" && !config.requiredEvidenceQuality.allowExplainedGap);
    if (isUnknownEquivalent) {
      if (config.unknownHandling === "INTERRUPT_CONTINUITY") {
        interrupted = true;
      } else if (config.unknownHandling === "TERMINATE_EPISODE") {
        terminated = true;
      }
    }
  }

  const unknownFraction = safeRatio(unknownSeconds, totalDurationSeconds) ?? 0;
  const isCoverageSufficient = totalDurationSeconds > 0 && unknownFraction <= config.requiredEvidenceQuality.maxUnknownFraction;

  let status: CoverageAssessment["status"] = "SUFFICIENT";
  if (terminated) {
    status = "TERMINATED";
  } else if (interrupted) {
    status = "INTERRUPTED";
  } else if (!isCoverageSufficient) {
    status = "INDETERMINATE_COVERAGE";
  }

  return {
    totalDurationSeconds,
    usableObservedSeconds,
    usableReportedSeconds,
    explainedGapSeconds,
    unknownSeconds,
    unknownFraction,
    isCoverageSufficient,
    status,
  };
}
