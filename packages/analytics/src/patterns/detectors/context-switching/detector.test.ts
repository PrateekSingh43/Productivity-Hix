import { test, describe } from "node:test";
import assert from "node:assert";
import { ContextSwitchingDetector } from "./detector";
import type { ContextSwitchingConfig } from "./types";
import type { TemporalEvidenceBlock, WorkSession } from "@repo/types";
import type { EpisodeExecutionContext, PatternLevelExecutionContext } from "../../base/context";

describe("Detector 1: detector.ts", () => {
  const config: ContextSwitchingConfig = {
    minimumEpisodeActiveDurationSeconds: 1800, // 30 mins
    minimumUsableCoverageRatio: 0.85,
    shortContextThresholdSeconds: 30,
    minimumQualifyingSessions: 5,
    minimumQualifyingCalendarDays: 3,
    minimumBaselineDays: 14,
    minimumBaselineSessions: 5,
    switchContrastThreshold: 0.50,
    absoluteElevatedSwitchThreshold: 6.0,
    switchRecurrenceThreshold: 0.60,
    minimumPatternCoverageRatio: 0.85,
  };

  const createBlock = (app: string, durationSeconds: number): TemporalEvidenceBlock => ({
    id: "b1",
    startTime: "2023-01-01T00:00:00Z",
    endTime: "2023-01-01T00:00:00Z",
    durationSeconds,
    coverage: "OBSERVED",
    provenance: [],
    observation: {
      application: app,
      title: "Title",
      cleanTitle: "Title",
      domain: null,
      category: "general",
      isAfk: false,
      rawEventCount: 1,
    },
    report: null,
    intention: null,
    outcome: null,
  });

  test("evaluateEpisode: sufficient coverage and duration", () => {
    const blocks = [
      createBlock("Code", 1800),
      createBlock("Chrome", 1800) // Total active 3600 (1 hour)
    ];

    const detector = new ContextSwitchingDetector(config, null as any, null as any);
    
    const context: EpisodeExecutionContext = {
      level: "EPISODE",
      userId: "u1",
      timezone: "UTC",
      timeline: {
        windowStart: "2023-01-01T00:00:00Z",
        windowEnd: "2023-01-01T01:00:00Z",
        totalDurationSeconds: 3600,
        blocks,
        coverageSummary: {
          totalDurationSeconds: 3600,
          observedSeconds: 3600,
          reportedSeconds: 0,
          observedReportedSeconds: 0,
          unknownSeconds: 0,
          explainedGapSeconds: 0,
          coverageRatio: 1
        }
      },
      config: {
        detectorIdentity: "context_switching_density",
        detectorVersion: "1.0.0",
        configurationVersion: "1.0.0",
        attributionMode: "GENERAL",
        baselineStrategy: "PERSONAL_30_DAY",
        sufficiency: {} as any
      },
      generateOperationalMetadata: () => ({ timestamp: "now", contextType: "test", detectorVersion: "1.0", configurationVersion: "1.0", generatedAt: "now" })
    };

    const res = detector.evaluateEpisode(context, "eval-1");
    assert.strictEqual(res.executionStatus, "QUALIFIED");
    assert.strictEqual(res.metrics.switchesPerHour, 1);
    // dwells: [1800, 1800] -> median is 1800
    assert.strictEqual(res.metrics.medianDwellSeconds, 1800);
  });

  test("evaluateEpisode: zero active duration fallback", () => {
    const blocks: TemporalEvidenceBlock[] = []; // No active time

    const detector = new ContextSwitchingDetector(config, null as any, null as any);
    
    const context: EpisodeExecutionContext = {
      level: "EPISODE",
      userId: "u1",
      timezone: "UTC",
      timeline: {
        windowStart: "2023-01-01T00:00:00Z",
        windowEnd: "2023-01-01T01:00:00Z",
        totalDurationSeconds: 3600,
        blocks,
        coverageSummary: {
          totalDurationSeconds: 3600,
          observedSeconds: 0,
          reportedSeconds: 0,
          observedReportedSeconds: 0,
          unknownSeconds: 3600,
          explainedGapSeconds: 0,
          coverageRatio: 0
        }
      },
      config: {
        detectorIdentity: "context_switching_density",
        detectorVersion: "1.0.0",
        configurationVersion: "1.0.0",
        attributionMode: "GENERAL",
        baselineStrategy: "PERSONAL_30_DAY",
        sufficiency: {} as any
      },
      generateOperationalMetadata: () => ({ timestamp: "now", contextType: "test", detectorVersion: "1.0", configurationVersion: "1.0", generatedAt: "now" })
    };

    const res = detector.evaluateEpisode(context, "eval-1");
    // Fails minimum duration first
    assert.strictEqual(res.executionStatus, "INSUFFICIENT_EVIDENCE");
    assert.strictEqual(res.metrics.switchesPerHour, null);
  });

  test("evaluatePattern: test determinism and pattern detection", async () => {
    // Current Window Episodes
    const createEp = (switches: number, day: string) => ({
      level: "EPISODE",
      executionStatus: "QUALIFIED",
      episodeEvidence: { sessionId: "s" + day },
      activeDurationSeconds: 3600,
      coverageRatio: 1,
      metrics: { switchesPerHour: switches },
      temporalWindow: { start: `2023-10-${day}T12:00:00Z` }
    } as any);

    const episodes = [
      createEp(10, "15"),
      createEp(10, "16"),
      createEp(10, "17"),
      createEp(10, "18"),
      createEp(10, "19"),
    ]; // 5 episodes, 5 distinct days, median = 10 switches/hr

    // Baseline historical sessions
    const baselinePop = [
      { switchesPerHour: 2 },
      { switchesPerHour: 2 },
      { switchesPerHour: 2 },
      { switchesPerHour: 2 },
      { switchesPerHour: 2 },
    ] as any;

    const currentProvider = {
      fetchEpisodes: async () => episodes
    };
    const baselineProvider = {
      populationType: "completed_sessions",
      fetchPopulation: async () => baselinePop
    };

    const detector = new ContextSwitchingDetector(config, currentProvider, baselineProvider);

    const context: PatternLevelExecutionContext = {
      level: "PATTERN",
      userId: "u1",
      timezone: "UTC",
      timeline: {
        windowStart: "2023-10-15T00:00:00Z",
        windowEnd: "2023-10-29T00:00:00Z",
        totalDurationSeconds: 14 * 86400,
        blocks: [],
        coverageSummary: {
          totalDurationSeconds: 14 * 86400,
          observedSeconds: 14 * 86400,
          reportedSeconds: 0,
          observedReportedSeconds: 0,
          unknownSeconds: 0,
          explainedGapSeconds: 0,
          coverageRatio: 1
        }
      },
      config: {
        detectorIdentity: "context_switching_density",
        detectorVersion: "1.0.0",
        configurationVersion: "1.0.0",
        attributionMode: "GENERAL",
        baselineStrategy: "PERSONAL_30_DAY",
        sufficiency: {} as any
      },
      generateOperationalMetadata: () => ({ timestamp: "now", contextType: "test", detectorVersion: "1.0", configurationVersion: "1.0", generatedAt: "now" })
    };

    const res = await detector.evaluatePattern(context, "eval-pat", "pat-1");

    // current = 10, baseline = 2
    // contrast = 8 / 2 = 4.0 >= 0.5 (passes)
    // recurrence: 5/5 = 1.0 > 0.6 (passes)
    assert.strictEqual(res.executionStatus, "DETECTED");
    assert.strictEqual(res.baseline.comparisonStatus, "EVALUATED");
    assert.strictEqual(res.baseline.baselineValue, 2);
    assert.strictEqual(res.baseline.currentValue, 10);
    assert.strictEqual(res.baseline.deltaRatio, 4.0);

    // DETERMINISM: Test shuffled input produces identical result
    const shuffledEpisodes = [episodes[3], episodes[0], episodes[4], episodes[1], episodes[2]];
    const shuffledProvider = { fetchEpisodes: async () => shuffledEpisodes };
    const detectorShuffled = new ContextSwitchingDetector(config, shuffledProvider, baselineProvider);
    
    const resShuffled = await detectorShuffled.evaluatePattern(context, "eval-pat", "pat-1");
    assert.strictEqual(resShuffled.executionStatus, "DETECTED");
    assert.deepStrictEqual(res.evidenceReferences, resShuffled.evidenceReferences);
  });
});
