import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEpisodeResult, createPatternResult } from "./detector";
import { PatternExecutionContext, EpisodeExecutionContext, PatternLevelExecutionContext, DetectorConfiguration } from "./context";
import type { EvidenceTimeline, EpisodeExecutionStatus, PatternExecutionStatus } from "@repo/types";

describe("Phase 4: Base Detector Outputs", () => {
  const mockConfig: DetectorConfiguration = {
    detectorIdentity: "TEST_DETECTOR",
    detectorVersion: "1.0",
    configurationVersion: "v1",
    baselineStrategy: "NONE",
    attributionMode: "GENERAL",
    sufficiency: {
      requiredEvidenceQuality: { allowReportedOnly: false, allowExplainedGap: false, maxUnknownFraction: 0 },
      unknownHandling: "INTERRUPT_CONTINUITY"
    }
  };

  const mockTimeline: EvidenceTimeline = {
    windowStart: "2026-09-14T10:00:00Z",
    windowEnd: "2026-09-14T11:00:00Z",
    totalDurationSeconds: 3600,
    blocks: [],
    coverageSummary: {
      totalDurationSeconds: 3600,
      observedSeconds: 3600,
      reportedSeconds: 0,
      observedReportedSeconds: 0,
      unknownSeconds: 0,
      explainedGapSeconds: 0,
      coverageRatio: 1.0
    }
  };

  it("createEpisodeResult validates EPISODE context at runtime and compile time", () => {
    // We instantiate the base class but cast it to the correct interface for the test
    const context = new PatternExecutionContext({
      timeline: mockTimeline,
      timezone: "UTC",
      userId: "user_1",
      config: mockConfig,
      level: "EPISODE"
    }) as EpisodeExecutionContext;

    const result = createEpisodeResult(
      context,
      "eval_1",
      "QUALIFIED" as EpisodeExecutionStatus,
      {
        metrics: {},
        taxonomy: "context_dynamics",
        temporalWindow: { start: "2026-09-14T10:00:00Z", end: "2026-09-14T11:00:00Z", scale: "CONTINUOUS_INTERVAL" },
        episodeEvidence: { boundingWindow: { start: "2026-09-14T10:00:00Z", end: "2026-09-14T11:00:00Z" } },
        activeDurationSeconds: 3600,
        coverageRatio: 1.0,
        epistemicCaveats: []
      }
    );

    assert.equal(result.level, "EPISODE");
    assert.equal(result.detectorIdentity, "TEST_DETECTOR");
    assert.equal(result.metadata.evaluationId, "eval_1");
  });

  it("createPatternResult validates PATTERN context at runtime and compile time", () => {
    const context = new PatternExecutionContext({
      timeline: mockTimeline,
      timezone: "UTC",
      userId: "user_1",
      config: mockConfig,
      level: "PATTERN"
    }) as PatternLevelExecutionContext;

    const result = createPatternResult(
      context,
      "eval_2",
      "pattern_X",
      "DETECTED" as PatternExecutionStatus,
      {
        patternType: "REPEATED_BEHAVIOR",
        taxonomy: "context_dynamics",
        temporalWindow: { start: "2026-09-01T00:00:00Z", end: "2026-09-14T00:00:00Z", scale: "14_DAY" },
        sample: { qualifyingDays: 10, qualifyingEpisodes: 20, totalObservedHours: 50, meanCoverageRatio: 0.9 },
        baseline: { strategy: "NONE", comparedMetric: "none", baselineValue: null, currentValue: null, deltaRatio: null, comparisonStatus: "NOT_APPLICABLE" },
        reliability: { tier: "PROVISIONAL", calibrationStatus: "UNVALIDATED_PROTOTYPE", evidenceQualityFactors: { qualifyingDayCount: 10, qualifyingEpisodeCount: 20, meanTelemetryCoverageRatio: 0.9, temporalVariability: null, baselineMaturityDays: 14, hasCorroboratingSelfReport: false } },
        evidenceReferences: { sampleBoundingWindows: [] },
        epistemicCaveats: [],
        metrics: {}
      }
    );

    assert.equal(result.level, "PATTERN");
    assert.equal((result as any).detectorIdentity, undefined); // detectorIdentity must NOT be top-level
    assert.equal(result.metadata.evaluationId, "eval_2");
    assert.equal(result.metadata.patternId, "pattern_X");
  });

  it("runtime guards reject mismatched context levels", () => {
    const episodeContext = new PatternExecutionContext({
      timeline: mockTimeline,
      timezone: "UTC",
      userId: "user_1",
      config: mockConfig,
      level: "EPISODE"
    }) as PatternLevelExecutionContext; // Intentionally lying to the compiler

    assert.throws(() => {
      createPatternResult(
        episodeContext,
        "eval_err",
        "pattern_err",
        "DETECTED" as PatternExecutionStatus,
        {
          patternType: "TEST",
          taxonomy: "context_dynamics",
          temporalWindow: { start: "2026-09-01T00:00:00Z", end: "2026-09-14T00:00:00Z", scale: "14_DAY" },
          sample: { qualifyingDays: 10, qualifyingEpisodes: 20, totalObservedHours: 50, meanCoverageRatio: 0.9 },
          baseline: { strategy: "NONE", comparedMetric: "none", baselineValue: null, currentValue: null, deltaRatio: null, comparisonStatus: "NOT_APPLICABLE" },
          reliability: { tier: "PROVISIONAL", calibrationStatus: "UNVALIDATED_PROTOTYPE", evidenceQualityFactors: { qualifyingDayCount: 10, qualifyingEpisodeCount: 20, meanTelemetryCoverageRatio: 0.9, temporalVariability: null, baselineMaturityDays: 14, hasCorroboratingSelfReport: false } },
          evidenceReferences: { sampleBoundingWindows: [] },
          epistemicCaveats: [],
          metrics: {}
        }
      );
    }, new Error("Cannot create Pattern result from a non-PATTERN context"));
  });
});
