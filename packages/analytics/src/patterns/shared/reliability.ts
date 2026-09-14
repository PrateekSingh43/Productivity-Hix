import type { PatternReliability } from "@repo/types";

/**
 * Shared Reliability utilities for Phase 4 Analytics.
 */

export interface InitializeReliabilityOptions {
  qualifyingDayCount: number;
  qualifyingEpisodeCount: number;
  meanTelemetryCoverageRatio: number;
  baselineMaturityDays: number;
  hasCorroboratingSelfReport: boolean;
  temporalVariability?: number | null;
}

/**
 * Initializes PatternReliability for Phase 4.
 * Before empirical calibration, this MUST return tier: PROVISIONAL
 * and calibrationStatus: UNVALIDATED_PROTOTYPE.
 */
export function initializeProvisionalReliability(options: InitializeReliabilityOptions): PatternReliability {
  return {
    tier: "PROVISIONAL",
    calibrationStatus: "UNVALIDATED_PROTOTYPE",
    evidenceQualityFactors: {
      qualifyingDayCount: options.qualifyingDayCount,
      qualifyingEpisodeCount: options.qualifyingEpisodeCount,
      meanTelemetryCoverageRatio: options.meanTelemetryCoverageRatio,
      baselineMaturityDays: options.baselineMaturityDays,
      hasCorroboratingSelfReport: options.hasCorroboratingSelfReport,
      temporalVariability: options.temporalVariability ?? null,
    },
  };
}
