import { test, describe } from "node:test";
import assert from "node:assert";
import { ContextSwitchingDetector, type CurrentEpisodesProvider } from "./detector";
import type { ContextSwitchingConfig, ContextSwitchingBaselineSession, ContextSwitchingMetrics } from "./types";
import type { TemporalEvidenceBlock } from "@repo/types";
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
    sufficiency: {} as any
  };

  class MockCurrentEpisodesProvider implements CurrentEpisodesProvider<ContextSwitchingMetrics> {
    constructor(private readonly episodes: any[]) {}
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
      generateOperationalMetadata: () => ({ timestamp: "now", contextType: "test", detectorVersion: "1.0", configurationVersion: "1.0", generatedAt: "now" })
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

  test("evaluatePattern: full pattern decision, preserved metrics, timezone boundary", async () => {
    const createEp = (switches: number, day: string) => ({
      level: "EPISODE",
      executionStatus: "QUALIFIED",
      episodeEvidence: { sessionId: "s" + day },
      activeDurationSeconds: 3600,
      coverageRatio: 1,
      metrics: { switchesPerHour: switches, medianDwellSeconds: 300, interquartileDwellSeconds: 100, shortContextFraction: 0.1 },
      temporalWindow: { start: `2023-11-${day}T12:00:00Z` }
    } as any);

    const episodes = [
      createEp(10, "15"),
      createEp(10, "16"),
      createEp(10, "17"),
      createEp(10, "18"),
      createEp(10, "19"),
    ];

    const baselinePop: ContextSwitchingBaselineSession[] = [
      { sessionId: "h1", userId: "u1", startedAt: "2023-10-01T12:00:00Z", endedAt: "2023-10-01T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
      { sessionId: "h2", userId: "u1", startedAt: "2023-10-02T12:00:00Z", endedAt: "2023-10-02T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
      { sessionId: "h3", userId: "u1", startedAt: "2023-10-03T12:00:00Z", endedAt: "2023-10-03T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
      { sessionId: "h4", userId: "u1", startedAt: "2023-10-04T12:00:00Z", endedAt: "2023-10-04T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
      { sessionId: "h5", userId: "u1", startedAt: "2023-10-05T12:00:00Z", endedAt: "2023-10-05T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
      // add more days to ensure we pass the 14 days minimum
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

    let passedBaselineWindowStart = "";
    let passedBaselineWindowEnd = "";

    class SpyingBaselineProvider implements BaselinePopulationProvider<ContextSwitchingBaselineSession> {
      public readonly populationType = "completed_sessions";
      async fetchPopulation(userId: string, window: any) {
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
      generateOperationalMetadata: () => ({ timestamp: "now", contextType: "test", detectorVersion: "1.0", configurationVersion: "1.0", generatedAt: "now" })
    };

    const res = await detector.evaluatePattern(context, "eval-pat", "pat-1");

    // 1. Timezone Check
    // 30 days before Nov 15 midnight LA time is Oct 16 midnight LA time.
    // Oct 16 LA is UTC-7. So 07:00:00Z
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
    const createEp = (switches: number, day: string) => ({
      level: "EPISODE",
      executionStatus: "QUALIFIED",
      episodeEvidence: { sessionId: "s" + day },
      activeDurationSeconds: 3600,
      coverageRatio: 1,
      metrics: { switchesPerHour: switches, medianDwellSeconds: 300, interquartileDwellSeconds: 100, shortContextFraction: 0.1 },
      temporalWindow: { start: `2023-11-${day}T12:00:00Z` }
    } as any);

    const episodes = [
      createEp(10, "15"),
      createEp(10, "16"),
      createEp(10, "17"),
      createEp(10, "18"),
      createEp(10, "19"),
    ];

    // 5 sessions, but all on the same day! Minimum distinct days is 14.
    const baselinePop: ContextSwitchingBaselineSession[] = [
      { sessionId: "h1", userId: "u1", startedAt: "2023-10-01T12:00:00Z", endedAt: "2023-10-01T13:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
      { sessionId: "h2", userId: "u1", startedAt: "2023-10-01T13:00:00Z", endedAt: "2023-10-01T14:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
      { sessionId: "h3", userId: "u1", startedAt: "2023-10-01T14:00:00Z", endedAt: "2023-10-01T15:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
      { sessionId: "h4", userId: "u1", startedAt: "2023-10-01T15:00:00Z", endedAt: "2023-10-01T16:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
      { sessionId: "h5", userId: "u1", startedAt: "2023-10-01T16:00:00Z", endedAt: "2023-10-01T17:00:00Z", activeDurationSeconds: 3600, coverageRatio: 1, switchesPerHour: 2 },
    ];

    const detector = new ContextSwitchingDetector(config, new MockCurrentEpisodesProvider(episodes), new MockBaselineProvider(baselinePop));

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
      generateOperationalMetadata: () => ({ timestamp: "now", contextType: "test", detectorVersion: "1.0", configurationVersion: "1.0", generatedAt: "now" })
    };

    const res = await detector.evaluatePattern(context, "eval-pat", "pat-1");
    // Should fail baseline distinct day check
    assert.strictEqual(res.executionStatus, "INSUFFICIENT_BASELINE_DATA");
  });
});
