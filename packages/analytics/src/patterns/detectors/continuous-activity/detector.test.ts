import { test, describe } from "node:test";
import assert from "node:assert";
import { ContinuousActivityDetector } from "./detector";
import type { ContinuousActivityConfig } from "./types";
import type { TemporalEvidenceBlock, EvidenceCoverageState, TimelineCategory } from "@repo/types";
import type { EpisodeExecutionContext } from "../../base/context";

describe("Detector 3: Continuous Activity Detector (Extended Continuous Observed Activity)", () => {
  const defaultConfig: ContinuousActivityConfig = {
    minimumEpisodeDurationSeconds: 600, // 10 minutes
    maximumContinuityGapSeconds: 5, // 5-second continuity tolerance
    minimumCoverageRatio: 0.8,
    maxUnknownFraction: 0.05,
    detectorVersion: "1.0.0",
    configurationVersion: "1.0.0",
  };

  const createContext = (
    windowStart: string,
    windowEnd: string,
    blocks: TemporalEvidenceBlock[]
  ): EpisodeExecutionContext => ({
    userId: "user-123",
    canonicalSessionId: "session-456",
    timezone: "UTC",
    level: "EPISODE",
    timeline: {
      windowStart,
      windowEnd,
      totalDurationSeconds: Math.max(0, (Date.parse(windowEnd) - Date.parse(windowStart)) / 1000),
      blocks,
      coverageSummary: {
        totalDurationSeconds: Math.max(0, (Date.parse(windowEnd) - Date.parse(windowStart)) / 1000),
        observedSeconds: 0,
        reportedSeconds: 0,
        observedReportedSeconds: 0,
        explainedGapSeconds: 0,
        unknownSeconds: 0,
        coverageRatio: 1,
      },
    },
    config: {
      detectorIdentity: "extended_continuous_activity_episode",
      detectorVersion: "1.0.0",
      configurationVersion: "1.0.0",
      attributionMode: "GENERAL",
      baselineStrategy: "NONE",
      sufficiency: {
        requiredEvidenceQuality: {
          allowReportedOnly: false,
          allowExplainedGap: false,
          maxUnknownFraction: 0.05,
        },
        unknownHandling: "INDETERMINATE_IF_EXCEEDED",
      },
    },
    generateOperationalMetadata: () => ({
      detectorVersion: "1.0.0",
      configurationVersion: "1.0.0",
      generatedAt: "2026-09-15T12:00:00.000Z",
    }),
  });

  const createBlock = (
    id: string,
    startStr: string,
    endStr: string,
    durationSeconds: number,
    coverage: EvidenceCoverageState = "OBSERVED",
    isAfk = false,
    category: TimelineCategory = "general"
  ): TemporalEvidenceBlock => ({
    id,
    startTime: startStr,
    endTime: endStr,
    durationSeconds,
    coverage,
    provenance: [],
    observation: {
      application: "VS Code",
      title: "Work",
      cleanTitle: "Work",
      domain: null,
      category,
      isAfk,
      rawEventCount: 1,
    },
    report: null,
    intention: null,
    outcome: null,
  });

  // Test 1 — one continuous interval
  test("Test 1: one continuous interval: 10:00-11:00 observed -> duration = 3600s", () => {
    const detector = new ContinuousActivityDetector(defaultConfig);
    const blocks = [
      createBlock("b1", "2026-09-15T10:00:00.000Z", "2026-09-15T11:00:00.000Z", 3600),
    ];
    const context = createContext("2026-09-15T10:00:00.000Z", "2026-09-15T11:00:00.000Z", blocks);
    const result = detector.evaluateEpisode(context, "eval-1");

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.continuousDurationSeconds, 3600);
    assert.strictEqual(result.metrics.observedDurationSeconds, 3600);
    assert.strictEqual(result.metrics.interruptionCount, 0);
  });

  // Test 2 — contiguous intervals merge
  test("Test 2: contiguous intervals merge: 10:00-10:30, 10:30-11:00 -> one 60-minute continuous interval", () => {
    const detector = new ContinuousActivityDetector(defaultConfig);
    const blocks = [
      createBlock("b1", "2026-09-15T10:00:00.000Z", "2026-09-15T10:30:00.000Z", 1800),
      createBlock("b2", "2026-09-15T10:30:00.000Z", "2026-09-15T11:00:00.000Z", 1800),
    ];
    const context = createContext("2026-09-15T10:00:00.000Z", "2026-09-15T11:00:00.000Z", blocks);
    const result = detector.evaluateEpisode(context, "eval-2");

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.continuousDurationSeconds, 3600);
    assert.strictEqual(result.metrics.observedDurationSeconds, 3600);
    assert.strictEqual(result.metrics.interruptionCount, 0);
  });

  // Test 3 — small continuity gap
  test("Test 3: small continuity gap (2s) under tolerance merges, but separates under 0s tolerance", () => {
    const blocks = [
      createBlock("b1", "2026-09-15T10:00:00.000Z", "2026-09-15T10:30:00.000Z", 1800),
      createBlock("b2", "2026-09-15T10:30:02.000Z", "2026-09-15T11:00:00.000Z", 1798),
    ];
    const context = createContext("2026-09-15T10:00:00.000Z", "2026-09-15T11:00:00.000Z", blocks);

    // With 5s tolerance (defaultConfig.maximumContinuityGapSeconds = 5)
    const detectorWithTol = new ContinuousActivityDetector(defaultConfig);
    const resultMerged = detectorWithTol.evaluateEpisode(context, "eval-3-merged");
    assert.strictEqual(resultMerged.executionStatus, "QUALIFIED");
    assert.strictEqual(resultMerged.metrics.continuousDurationSeconds, 3600); // 10:00 to 11:00 span
    assert.strictEqual(resultMerged.metrics.observedDurationSeconds, 3598); // 1800 + 1798
    assert.strictEqual(resultMerged.metrics.interruptionCount, 0);

    // With 0s tolerance
    const detectorZeroTol = new ContinuousActivityDetector({
      ...defaultConfig,
      maximumContinuityGapSeconds: 0,
    });
    const resultSeparated = detectorZeroTol.evaluateEpisode(context, "eval-3-separated");
    assert.strictEqual(resultSeparated.executionStatus, "QUALIFIED");
    // Longest run is 1800s (b1)
    assert.strictEqual(resultSeparated.metrics.continuousDurationSeconds, 1800);
    assert.strictEqual(resultSeparated.metrics.interruptionCount, 1);
  });

  // Test 4 — known interruption
  test("Test 4: known interruption (break) breaks continuity into two runs", () => {
    const detector = new ContinuousActivityDetector(defaultConfig);
    const blocks = [
      createBlock("b1", "2026-09-15T10:00:00.000Z", "2026-09-15T10:30:00.000Z", 1800, "OBSERVED"),
      createBlock("b2", "2026-09-15T10:30:00.000Z", "2026-09-15T10:40:00.000Z", 600, "OBSERVED", false, "break"),
      createBlock("b3", "2026-09-15T10:40:00.000Z", "2026-09-15T11:00:00.000Z", 1200, "OBSERVED"),
    ];
    const context = createContext("2026-09-15T10:00:00.000Z", "2026-09-15T11:00:00.000Z", blocks);
    const result = detector.evaluateEpisode(context, "eval-4");

    // Two runs: 1800s and 1200s. Longest is 1800s.
    assert.strictEqual(result.metrics.continuousDurationSeconds, 1800);
    assert.strictEqual(result.metrics.interruptionCount, 1);
  });

  // Test 5 — UNKNOWN interruption
  test("Test 5: UNKNOWN interruption does not become continuous activity and breaks continuity", () => {
    const detector = new ContinuousActivityDetector({
      ...defaultConfig,
      maxUnknownFraction: 0.20, // allow up to 20% unknown so it doesn't fail on window unknown fraction
    });
    const blocks = [
      createBlock("b1", "2026-09-15T10:00:00.000Z", "2026-09-15T10:30:00.000Z", 1800, "OBSERVED"),
      createBlock("b2", "2026-09-15T10:30:00.000Z", "2026-09-15T10:40:00.000Z", 600, "UNKNOWN"),
      createBlock("b3", "2026-09-15T10:40:00.000Z", "2026-09-15T11:00:00.000Z", 1200, "OBSERVED"),
    ];
    const context = createContext("2026-09-15T10:00:00.000Z", "2026-09-15T11:00:00.000Z", blocks);
    const result = detector.evaluateEpisode(context, "eval-5");

    assert.notStrictEqual(result.metrics.continuousDurationSeconds, 3600);
    assert.strictEqual(result.metrics.continuousDurationSeconds, 1800);
    assert.strictEqual(result.metrics.interruptionCount, 1);
  });

  // Test 6 — overlap
  test("Test 6: overlapping evidence: 10:00-10:40 and 10:20-11:00 merges to union 3600s, not 4800s", () => {
    const detector = new ContinuousActivityDetector(defaultConfig);
    const blocks = [
      createBlock("b1", "2026-09-15T10:00:00.000Z", "2026-09-15T10:40:00.000Z", 2400),
      createBlock("b2", "2026-09-15T10:20:00.000Z", "2026-09-15T11:00:00.000Z", 2400),
    ];
    const context = createContext("2026-09-15T10:00:00.000Z", "2026-09-15T11:00:00.000Z", blocks);
    const result = detector.evaluateEpisode(context, "eval-6");

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.continuousDurationSeconds, 3600);
    assert.strictEqual(result.metrics.observedDurationSeconds, 3600);
  });

  // Test 7 — out-of-order input
  test("Test 7: out-of-order input produces identical deterministic result", () => {
    const detector = new ContinuousActivityDetector(defaultConfig);
    const blocksOrder1 = [
      createBlock("b1", "2026-09-15T10:00:00.000Z", "2026-09-15T10:30:00.000Z", 1800),
      createBlock("b2", "2026-09-15T10:30:00.000Z", "2026-09-15T11:00:00.000Z", 1800),
      createBlock("b3", "2026-09-15T11:00:00.000Z", "2026-09-15T11:20:00.000Z", 1200),
    ];
    const blocksOrder2 = [
      createBlock("b3", "2026-09-15T11:00:00.000Z", "2026-09-15T11:20:00.000Z", 1200),
      createBlock("b1", "2026-09-15T10:00:00.000Z", "2026-09-15T10:30:00.000Z", 1800),
      createBlock("b2", "2026-09-15T10:30:00.000Z", "2026-09-15T11:00:00.000Z", 1800),
    ];

    const ctx1 = createContext("2026-09-15T10:00:00.000Z", "2026-09-15T11:20:00.000Z", blocksOrder1);
    const ctx2 = createContext("2026-09-15T10:00:00.000Z", "2026-09-15T11:20:00.000Z", blocksOrder2);

    const res1 = detector.evaluateEpisode(ctx1, "eval-7");
    const res2 = detector.evaluateEpisode(ctx2, "eval-7");

    assert.deepStrictEqual(res1.metrics, res2.metrics);
    assert.strictEqual(res1.executionStatus, res2.executionStatus);
    assert.deepStrictEqual(res1.temporalWindow, res2.temporalWindow);
  });

  // Test 8 — zero duration
  test("Test 8: zero duration block (10:00-10:00) does not create fake qualifying activity", () => {
    const detector = new ContinuousActivityDetector(defaultConfig);
    const blocks = [
      createBlock("b-zero", "2026-09-15T10:00:00.000Z", "2026-09-15T10:00:00.000Z", 0),
    ];
    const context = createContext("2026-09-15T10:00:00.000Z", "2026-09-15T11:00:00.000Z", blocks);
    const result = detector.evaluateEpisode(context, "eval-8");

    assert.strictEqual(result.executionStatus, "INSUFFICIENT_EVIDENCE");
    assert.strictEqual(result.metrics.continuousDurationSeconds, 0);
    assert.ok(result.epistemicCaveats.includes("NO_QUALIFYING_OBSERVED_ACTIVITY"));
  });

  // Test 9 — invalid interval
  test("Test 9: invalid interval (end < start) does not create negative duration", () => {
    const detector = new ContinuousActivityDetector(defaultConfig);
    const blocks = [
      createBlock("b-inv", "2026-09-15T11:00:00.000Z", "2026-09-15T10:00:00.000Z", 1),
    ];
    // Intentionally pass an invalid block where start is after end
    blocks[0]!.startTime = "2026-09-15T11:00:00.000Z";
    blocks[0]!.endTime = "2026-09-15T10:00:00.000Z";
    const context = createContext("2026-09-15T10:00:00.000Z", "2026-09-15T11:00:00.000Z", blocks);
    const result = detector.evaluateEpisode(context, "eval-9");

    assert.strictEqual(result.executionStatus, "INSUFFICIENT_EVIDENCE");
    assert.strictEqual(result.metrics.continuousDurationSeconds, 0);
  });

  // Test 10 — exact threshold
  test("Test 10: exact threshold (600s) is inclusive (>= 600) -> QUALIFIED", () => {
    const detector = new ContinuousActivityDetector({
      ...defaultConfig,
      minimumEpisodeDurationSeconds: 600,
    });
    const blocks = [
      createBlock("b1", "2026-09-15T10:00:00.000Z", "2026-09-15T10:10:00.000Z", 600),
    ];
    const context = createContext("2026-09-15T10:00:00.000Z", "2026-09-15T10:10:00.000Z", blocks);
    const result = detector.evaluateEpisode(context, "eval-10");

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.continuousDurationSeconds, 600);
  });

  // Test 11 — just below threshold
  test("Test 11: just below threshold (599s) fails qualification but preserves measured metric", () => {
    const detector = new ContinuousActivityDetector({
      ...defaultConfig,
      minimumEpisodeDurationSeconds: 600,
    });
    const blocks = [
      createBlock("b1", "2026-09-15T10:00:00.000Z", "2026-09-15T10:09:59.000Z", 599),
    ];
    const context = createContext("2026-09-15T10:00:00.000Z", "2026-09-15T10:09:59.000Z", blocks);
    const result = detector.evaluateEpisode(context, "eval-11");

    assert.strictEqual(result.executionStatus, "NOT_QUALIFIED");
    assert.strictEqual(result.metrics.continuousDurationSeconds, 599); // Measurement decoupled from qualification
  });

  // Test 12 — open/current interval
  test("Test 12: open/current interval ending at windowEnd does not invent future end time and flags caveat", () => {
    const detector = new ContinuousActivityDetector(defaultConfig);
    const windowEnd = "2026-09-15T11:00:00.000Z";
    const blocks = [
      createBlock("b1", "2026-09-15T10:00:00.000Z", windowEnd, 3600),
    ];
    const context = createContext("2026-09-15T10:00:00.000Z", windowEnd, blocks);
    const result = detector.evaluateEpisode(context, "eval-12");

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.temporalWindow.end, windowEnd);
    assert.ok(result.epistemicCaveats.includes("OPEN_CURRENT_INTERVAL"));
  });
});
