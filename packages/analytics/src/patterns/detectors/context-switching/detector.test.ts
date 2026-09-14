import { test, describe } from "node:test";
import assert from "node:assert";
import { ContextSwitchingDetector, type CurrentEpisodesProvider } from "./detector";
import type { ContextSwitchingConfig, ContextSwitchingBaselineSession, ContextSwitchingMetrics } from "./types";
import type { TemporalEvidenceBlock, EpisodeMeasurementOutput } from "@repo/types";
import type { EpisodeExecutionContext, PatternLevelExecutionContext, DetectorConfiguration } from "../../base/context";
import type { BaselinePopulationProvider } from "../../baseline/source";

describe("Detector 1: detector.ts", () => {
  const config: ContextSwitchingConfig = {
    minimumEpisodeActiveDurationSeconds: 1800,
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

  const createBlock = (app: string, durationSeconds: number, startStr: string, endStr: string): TemporalEvidenceBlock => ({
    id: "b-" + app + "-" + startStr,
    startTime: startStr,
    endTime: endStr,
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

  const mockDetectorConfig: DetectorConfiguration = {
    detectorIdentity: "context_switching_density",
    detectorVersion: "1.0.0",
    configurationVersion: "1.0.0",
    attributionMode: "GENERAL",
    baselineStrategy: "PERSONAL_30_DAY",
    sufficiency: {
      requiredEvidenceQuality: {
        allowReportedOnly: false,
        allowExplainedGap: false,
        maxUnknownFraction: 0.15
      },
      unknownHandling: "INDETERMINATE_IF_EXCEEDED"
    }
  };

  class MockCurrentEpisodesProvider implements CurrentEpisodesProvider<ContextSwitchingMetrics> {
    constructor(private readonly episodes: EpisodeMeasurementOutput<ContextSwitchingMetrics>[]) {}
    async fetchEpisodes() { return this.episodes; }
  }

  class MockBaselineProvider implements BaselinePopulationProvider<ContextSwitchingBaselineSession> {
    public readonly populationType = "completed_sessions";
    constructor(private readonly sessions: ContextSwitchingBaselineSession[]) {}
    async fetchPopulation() { return this.sessions; }
  }

  const dummyProvider = new MockCurrentEpisodesProvider([]);
  const dummyBaseline = new MockBaselineProvider([]);

  test("evaluateEpisode: valid execution and evidence identity preservation", () => {
    const blocks = [
      createBlock("Code", 1800, "2023-01-01T00:00:00Z", "2023-01-01T00:30:00Z"),
      createBlock("Chrome", 1800, "2023-01-01T00:30:00Z", "2023-01-01T01:00:00Z")
    ];

    const detector = new ContextSwitchingDetector(config, dummyProvider, dummyBaseline);
    
    const context: EpisodeExecutionContext = {
      level: "EPISODE",
      userId: "u1",
      timezone: "UTC",
      canonicalSessionId: "authoritative-session-123",
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
      config: mockDetectorConfig,
      generateOperationalMetadata: () => ({ detectorVersion: "1.0", configurationVersion: "1.0", generatedAt: "now" })
    };

    const res = detector.evaluateEpisode(context, "eval-1");
    assert.strictEqual(res.executionStatus, "QUALIFIED");
    assert.strictEqual(res.metrics.switchesPerHour, 1);
    assert.strictEqual(res.episodeEvidence.sessionId, "authoritative-session-123");
    
    // Determinism check by shuffling inputs
    const contextShuffled = { ...context, timeline: { ...context.timeline, blocks: [blocks[1], blocks[0]] }} as EpisodeExecutionContext;
    const resShuffled = detector.evaluateEpisode(contextShuffled, "eval-1");
    assert.deepStrictEqual(res, resShuffled);
  });

  const createEp = (switches: number, dateStr: string, day: string): EpisodeMeasurementOutput<ContextSwitchingMetrics> => ({
    metadata: {
      evaluationId: "eval-" + day,
      detectorVersion: "1.0",
      configurationVersion: "1.0",
      generatedAt: "now"
    },
    userId: "u1",
    detectorIdentity: "context_switching_density",
    level: "EPISODE",
    attributionMode: "GENERAL",
    executionStatus: "QUALIFIED",
    taxonomy: "context_dynamics",
    episodeEvidence: {
      sessionId: "s" + day,
      boundingWindow: { start: dateStr, end: dateStr }
    },
    temporalWindow: { start: dateStr, end: dateStr, scale: "CONTINUOUS_INTERVAL" },
    activeDurationSeconds: 3600,
    coverageRatio: 1,
    metrics: { switchesPerHour: switches, medianDwellSeconds: 300, interquartileDwellSeconds: 100, shortContextFraction: 0.1 },
    epistemicCaveats: []
  });

  const baselinePop: ContextSwitchingBaselineSession[] = [
    { sessionId: "h1", userId: "u1", startedAt: "2023-10-01T12:00:00Z", endedAt: "2023-10-01T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    { sessionId: "h2", userId: "u1", startedAt: "2023-10-02T12:00:00Z", endedAt: "2023-10-02T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    { sessionId: "h3", userId: "u1", startedAt: "2023-10-03T12:00:00Z", endedAt: "2023-10-03T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    { sessionId: "h4", userId: "u1", startedAt: "2023-10-04T12:00:00Z", endedAt: "2023-10-04T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    { sessionId: "h5", userId: "u1", startedAt: "2023-10-05T12:00:00Z", endedAt: "2023-10-05T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    { sessionId: "h6", userId: "u1", startedAt: "2023-10-06T12:00:00Z", endedAt: "2023-10-06T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    { sessionId: "h7", userId: "u1", startedAt: "2023-10-07T12:00:00Z", endedAt: "2023-10-07T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    { sessionId: "h8", userId: "u1", startedAt: "2023-10-08T12:00:00Z", endedAt: "2023-10-08T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    { sessionId: "h9", userId: "u1", startedAt: "2023-10-09T12:00:00Z", endedAt: "2023-10-09T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    { sessionId: "h10", userId: "u1", startedAt: "2023-10-10T12:00:00Z", endedAt: "2023-10-10T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    { sessionId: "h11", userId: "u1", startedAt: "2023-10-11T12:00:00Z", endedAt: "2023-10-11T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    { sessionId: "h12", userId: "u1", startedAt: "2023-10-12T12:00:00Z", endedAt: "2023-10-12T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    { sessionId: "h13", userId: "u1", startedAt: "2023-10-13T12:00:00Z", endedAt: "2023-10-13T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    { sessionId: "h14", userId: "u1", startedAt: "2023-10-14T12:00:00Z", endedAt: "2023-10-14T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
  ];

  test("evaluatePattern: full pattern decision, preserved metrics, timezone boundary", async () => {
    const episodes = [
      createEp(10, "2023-11-15T12:00:00Z", "15"),
      createEp(10, "2023-11-16T12:00:00Z", "16"),
      createEp(10, "2023-11-17T12:00:00Z", "17"),
      createEp(10, "2023-11-18T12:00:00Z", "18"),
      createEp(10, "2023-11-19T12:00:00Z", "19"),
    ];

    let passedBaselineWindowStart = "";
    let passedBaselineWindowEnd = "";

    class SpyingBaselineProvider implements BaselinePopulationProvider<ContextSwitchingBaselineSession> {
      public readonly populationType = "completed_sessions";
      async fetchPopulation(userId: string, window: { start: string; end: string }) {
        passedBaselineWindowStart = window.start;
        passedBaselineWindowEnd = window.end;
        return baselinePop;
      }
    }

    const detector = new ContextSwitchingDetector(config, new MockCurrentEpisodesProvider(episodes), new SpyingBaselineProvider());

    const context: PatternLevelExecutionContext = {
      level: "PATTERN",
      userId: "u1",
      timezone: "America/Los_Angeles", // Non-UTC test
      timeline: {
        windowStart: "2023-11-15T08:00:00.000Z", // Midnight LA time
        windowEnd: "2023-11-29T08:00:00.000Z",
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
      config: mockDetectorConfig,
      generateOperationalMetadata: () => ({ detectorVersion: "1.0", configurationVersion: "1.0", generatedAt: "now" })
    };

    const res = await detector.evaluatePattern(context, "eval-pat", "pat-1");

    // 1. Timezone Check
    assert.strictEqual(passedBaselineWindowEnd, "2023-11-15T08:00:00.000Z");
    assert.strictEqual(passedBaselineWindowStart, "2023-10-16T07:00:00.000Z");

    // 2. Full Decision Check
    assert.strictEqual(res.executionStatus, "DETECTED");
    assert.strictEqual(res.baseline.deltaRatio, 4.0);

    // 3. Preserved Metrics Check
    assert.strictEqual(res.metrics.switchesPerHour, 10);
    assert.strictEqual(res.metrics.medianDwellSeconds, 300);
    assert.strictEqual(res.metrics.interquartileDwellSeconds, 100);
    assert.strictEqual(res.metrics.shortContextFraction, 0.1);
    
    // 4. Preserved Recurrence Check
    assert.strictEqual(res.metrics.elevatedSessionFraction, 1.0);
  });

  test("evaluatePattern: Baseline Distinct Days Guard", async () => {
    const episodes = [
      createEp(10, "2023-11-15T12:00:00Z", "15"),
      createEp(10, "2023-11-16T12:00:00Z", "16"),
      createEp(10, "2023-11-17T12:00:00Z", "17"),
      createEp(10, "2023-11-18T12:00:00Z", "18"),
      createEp(10, "2023-11-19T12:00:00Z", "19"),
    ];

    // 5 sessions, but all on the same day! Minimum distinct days is 14.
    const badBaselinePop: ContextSwitchingBaselineSession[] = [
      { sessionId: "h1", userId: "u1", startedAt: "2023-10-01T12:00:00Z", endedAt: "2023-10-01T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
      { sessionId: "h2", userId: "u1", startedAt: "2023-10-01T13:00:00Z", endedAt: "2023-10-01T14:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
      { sessionId: "h3", userId: "u1", startedAt: "2023-10-01T14:00:00Z", endedAt: "2023-10-01T15:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
      { sessionId: "h4", userId: "u1", startedAt: "2023-10-01T15:00:00Z", endedAt: "2023-10-01T16:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
      { sessionId: "h5", userId: "u1", startedAt: "2023-10-01T16:00:00Z", endedAt: "2023-10-01T17:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    ];

    const detector = new ContextSwitchingDetector(config, new MockCurrentEpisodesProvider(episodes), new MockBaselineProvider(badBaselinePop));

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
      config: mockDetectorConfig,
      generateOperationalMetadata: () => ({ detectorVersion: "1.0", configurationVersion: "1.0", generatedAt: "now" })
    };

    const res = await detector.evaluatePattern(context, "eval-pat", "pat-1");
    // Should fail baseline distinct day check
    assert.strictEqual(res.executionStatus, "INSUFFICIENT_BASELINE_DATA");
  });

  test("evaluatePattern: Timezone regression test for current window distinct days", async () => {
    // We want to test that if UTC dates differ but local dates are the same, it counts as ONE distinct day.
    // Timezone: America/Los_Angeles (UTC-8 in standard time, UTC-7 in daylight time)
    // Let's use standard time: Nov 15 2023.
    // Nov 15 2023 20:00:00 PST = Nov 16 2023 04:00:00 UTC.
    // Nov 15 2023 10:00:00 PST = Nov 15 2023 18:00:00 UTC.
    
    // We provide 5 qualifying episodes. 
    // They will span UTC dates Nov 15 and Nov 16, but local date is always Nov 15!
    const localSameEpisodes = [
      createEp(10, "2023-11-15T18:00:00Z", "1"), // 10:00 PST Nov 15
      createEp(10, "2023-11-15T22:00:00Z", "2"), // 14:00 PST Nov 15
      createEp(10, "2023-11-16T02:00:00Z", "3"), // 18:00 PST Nov 15
      createEp(10, "2023-11-16T04:00:00Z", "4"), // 20:00 PST Nov 15
      createEp(10, "2023-11-16T06:00:00Z", "5"), // 22:00 PST Nov 15
    ];

    const contextLocalSame: PatternLevelExecutionContext = {
      level: "PATTERN",
      userId: "u1",
      timezone: "America/Los_Angeles", 
      timeline: {
        windowStart: "2023-11-15T08:00:00.000Z", // Midnight LA time Nov 15
        windowEnd: "2023-11-29T08:00:00.000Z",
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
      config: mockDetectorConfig,
      generateOperationalMetadata: () => ({ detectorVersion: "1.0", configurationVersion: "1.0", generatedAt: "now" })
    };

    const detectorSame = new ContextSwitchingDetector(config, new MockCurrentEpisodesProvider(localSameEpisodes), new MockBaselineProvider(baselinePop));
    
    const resSame = await detectorSame.evaluatePattern(contextLocalSame, "eval-pat-same", "pat-1");
    // Because it's only ONE local day, but minimumQualifyingCalendarDays is 3, it should fail with INSUFFICIENT_EVIDENCE
    assert.strictEqual(resSame.executionStatus, "INSUFFICIENT_EVIDENCE");

    // Now test where UTC dates are the same, but local dates differ.
    // UTC Nov 15 02:00:00Z = Nov 14 18:00:00 PST
    // UTC Nov 15 18:00:00Z = Nov 15 10:00:00 PST
    // UTC Nov 16 02:00:00Z = Nov 15 18:00:00 PST
    // UTC Nov 16 18:00:00Z = Nov 16 10:00:00 PST
    // These 4 episodes span 3 distinct local days: Nov 14, Nov 15, Nov 16.
    const localDiffEpisodes = [
      createEp(10, "2023-11-15T02:00:00Z", "1"), // Nov 14 local
      createEp(10, "2023-11-15T18:00:00Z", "2"), // Nov 15 local
      createEp(10, "2023-11-16T02:00:00Z", "3"), // Nov 15 local
      createEp(10, "2023-11-16T18:00:00Z", "4"), // Nov 16 local
      createEp(10, "2023-11-16T20:00:00Z", "5"), // Nov 16 local
    ];

    const detectorDiff = new ContextSwitchingDetector(config, new MockCurrentEpisodesProvider(localDiffEpisodes), new MockBaselineProvider(baselinePop));
    const resDiff = await detectorDiff.evaluatePattern(contextLocalSame, "eval-pat-diff", "pat-1");
    
    // We have 5 sessions, 3 distinct local days. It should pass evidence sufficiency!
    assert.notStrictEqual(resDiff.executionStatus, "INSUFFICIENT_EVIDENCE");
    assert.strictEqual(resDiff.executionStatus, "DETECTED");
  });

  test("evaluatePattern: Timezone regression test for baseline distinct days", async () => {
    const episodes = [
      createEp(10, "2023-11-15T12:00:00Z", "15"),
      createEp(10, "2023-11-16T12:00:00Z", "16"),
      createEp(10, "2023-11-17T12:00:00Z", "17"),
      createEp(10, "2023-11-18T12:00:00Z", "18"),
      createEp(10, "2023-11-19T12:00:00Z", "19"),
    ];

    // Minimum baseline days is 14. We will provide 14 distinct *local* LA days.
    // However, two of these sessions will fall on the SAME UTC date.
    // If the distinct day logic uses UTC, it will only count 13 days and fail.
    // Local dates: Oct 1 through Oct 14.
    const tzBaselinePop: ContextSwitchingBaselineSession[] = [
      { sessionId: "h1", userId: "u1", startedAt: "2023-10-01T23:30:00Z", endedAt: "2023-10-01T23:45:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // UTC: Oct 1, LA: Oct 1 (01:30 PST)
      { sessionId: "h2", userId: "u1", startedAt: "2023-10-02T00:30:00Z", endedAt: "2023-10-02T00:45:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // UTC: Oct 2, LA: Oct 1 (17:30 PST)
      // That was 2 UTC days, but BOTH are Oct 1 in LA!
      // To provide exactly 14 LA days, we add Oct 2 through Oct 14.
      { sessionId: "h3", userId: "u1", startedAt: "2023-10-02T12:00:00Z", endedAt: "2023-10-02T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 2
      { sessionId: "h4", userId: "u1", startedAt: "2023-10-03T12:00:00Z", endedAt: "2023-10-03T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 3
      { sessionId: "h5", userId: "u1", startedAt: "2023-10-04T12:00:00Z", endedAt: "2023-10-04T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 4
      { sessionId: "h6", userId: "u1", startedAt: "2023-10-05T12:00:00Z", endedAt: "2023-10-05T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 5
      { sessionId: "h7", userId: "u1", startedAt: "2023-10-06T12:00:00Z", endedAt: "2023-10-06T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 6
      { sessionId: "h8", userId: "u1", startedAt: "2023-10-07T12:00:00Z", endedAt: "2023-10-07T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 7
      { sessionId: "h9", userId: "u1", startedAt: "2023-10-08T12:00:00Z", endedAt: "2023-10-08T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 8
      { sessionId: "h10", userId: "u1", startedAt: "2023-10-09T12:00:00Z", endedAt: "2023-10-09T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 9
      { sessionId: "h11", userId: "u1", startedAt: "2023-10-10T12:00:00Z", endedAt: "2023-10-10T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 10
      { sessionId: "h12", userId: "u1", startedAt: "2023-10-11T12:00:00Z", endedAt: "2023-10-11T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 11
      { sessionId: "h13", userId: "u1", startedAt: "2023-10-12T12:00:00Z", endedAt: "2023-10-12T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 12
      { sessionId: "h14", userId: "u1", startedAt: "2023-10-13T12:00:00Z", endedAt: "2023-10-13T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 13
      { sessionId: "h15", userId: "u1", startedAt: "2023-10-14T12:00:00Z", endedAt: "2023-10-14T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 14
    ];
    
    // There are 15 sessions here.
    // In UTC, there are 14 distinct dates: Oct 1 through Oct 14.
    // Wait, if I want UTC dates to be FEWER, I should map two LA days onto the SAME UTC date.
    // Example: 
    // Session A: 2023-11-01 23:30 local = 2023-11-02 06:30 UTC
    // Session B: 2023-11-02 00:30 local = 2023-11-02 07:30 UTC
    // These are TWO distinct local days (Nov 1 and Nov 2).
    // But they share the SAME UTC date (Nov 2).
    
    // So let's build 14 sessions that are exactly 14 distinct local LA days,
    // but some of them share the same UTC date.
    const tzBaselinePopCorrected: ContextSwitchingBaselineSession[] = [
      { sessionId: "h1", userId: "u1", startedAt: "2023-10-02T06:30:00Z", endedAt: "2023-10-02T07:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 1 23:30
      { sessionId: "h2", userId: "u1", startedAt: "2023-10-02T07:30:00Z", endedAt: "2023-10-02T08:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 2 00:30
      // UTC day is Oct 2 for both. Local days are Oct 1 and Oct 2.
      // So far: 1 UTC day, 2 Local days.
      { sessionId: "h3", userId: "u1", startedAt: "2023-10-03T12:00:00Z", endedAt: "2023-10-03T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 3
      { sessionId: "h4", userId: "u1", startedAt: "2023-10-04T12:00:00Z", endedAt: "2023-10-04T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 4
      { sessionId: "h5", userId: "u1", startedAt: "2023-10-05T12:00:00Z", endedAt: "2023-10-05T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 5
      { sessionId: "h6", userId: "u1", startedAt: "2023-10-06T12:00:00Z", endedAt: "2023-10-06T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 6
      { sessionId: "h7", userId: "u1", startedAt: "2023-10-07T12:00:00Z", endedAt: "2023-10-07T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 7
      { sessionId: "h8", userId: "u1", startedAt: "2023-10-08T12:00:00Z", endedAt: "2023-10-08T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 8
      { sessionId: "h9", userId: "u1", startedAt: "2023-10-09T12:00:00Z", endedAt: "2023-10-09T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 9
      { sessionId: "h10", userId: "u1", startedAt: "2023-10-10T12:00:00Z", endedAt: "2023-10-10T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 10
      { sessionId: "h11", userId: "u1", startedAt: "2023-10-11T12:00:00Z", endedAt: "2023-10-11T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 11
      { sessionId: "h12", userId: "u1", startedAt: "2023-10-12T12:00:00Z", endedAt: "2023-10-12T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 12
      { sessionId: "h13", userId: "u1", startedAt: "2023-10-13T12:00:00Z", endedAt: "2023-10-13T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 13
      { sessionId: "h14", userId: "u1", startedAt: "2023-10-14T12:00:00Z", endedAt: "2023-10-14T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 }, // LA Oct 14
    ];
    // Total local days = 14. Total UTC days = 13 (Oct 2 through Oct 14).
    
    const contextLocalSame: PatternLevelExecutionContext = {
      level: "PATTERN",
      userId: "u1",
      timezone: "America/Los_Angeles", 
      timeline: {
        windowStart: "2023-11-15T08:00:00.000Z", // Midnight LA time Nov 15
        windowEnd: "2023-11-29T08:00:00.000Z",
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
      config: mockDetectorConfig,
      generateOperationalMetadata: () => ({ detectorVersion: "1.0", configurationVersion: "1.0", generatedAt: "now" })
    };

    const detectorDiff = new ContextSwitchingDetector(config, new MockCurrentEpisodesProvider(episodes), new MockBaselineProvider(tzBaselinePopCorrected));
    const resDiff = await detectorDiff.evaluatePattern(contextLocalSame, "eval-pat-diff", "pat-1");
    
    // Because we have 14 distinct LOCAL LA days, but only 13 distinct UTC days,
    // if the baseline uses UTC, this will fail with INSUFFICIENT_BASELINE_DATA.
    // If it correctly uses the local timezone (America/Los_Angeles), it will pass.
    assert.strictEqual(resDiff.executionStatus, "DETECTED");
  });
});
