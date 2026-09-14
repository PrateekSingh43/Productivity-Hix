import { test, describe } from "node:test";
import assert from "node:assert";
import { TaskFragmentationDetector } from "./detector";
import type {
  TaskFragmentationConfig,
  TaskExecutionFragmentationMetrics,
  TaskExecutionBaselineEpisode,
  TaskExecutionFragmentationPatternMetrics,
  CurrentTaskEpisodesProvider,
} from "./types";
import type {
  TemporalEvidenceBlock,
  EpisodeMeasurementOutput,
  EvidenceCoverageState,
  EpisodeExecutionStatus,
} from "@repo/types";
import type {
  EpisodeExecutionContext,
  PatternLevelExecutionContext,
  DetectorConfiguration,
} from "../../base/context";
import type { BaselinePopulationProvider } from "../../baseline/source";

describe("Detector 2: detector.ts", () => {
  const config: TaskFragmentationConfig = {
    continuationGapThresholdSeconds: 7200, // 2 hours
    maxUnknownFraction: 0.20, // 20%
    minimumEpisodeActiveDurationSeconds: 600, // 10 minutes
    minimumQualifyingEpisodes: 3,
    minimumQualifyingCalendarDays: 2,
    minimumBaselineDays: 14,
    minimumBaselineEpisodes: 5,
    fragmentationContrastThreshold: 0.30,
    fragmentationRecurrenceThreshold: 0.60,
    minimumPatternCoverageRatio: 0.80,
  };

  const mockDetectorConfig: DetectorConfiguration = {
    detectorIdentity: "task_execution_fragmentation",
    detectorVersion: "1.0.0",
    configurationVersion: "1.0.0",
    attributionMode: "TASK_LINKED",
    baselineStrategy: "SAME_TASK_TYPE",
    sufficiency: {
      minimumQualifyingEpisodes: 3,
      minimumDistinctCalendarDays: 2,
      minimumBaselineMaturityDays: 14,
      requiredEvidenceQuality: {
        allowReportedOnly: false,
        allowExplainedGap: true,
        maxUnknownFraction: 0.20,
      },
      unknownHandling: "INDETERMINATE_IF_EXCEEDED",
    },
  };

  const createTaskBlock = (
    id: string,
    startStr: string,
    endStr: string,
    durationSeconds: number,
    taskId: string,
    coverage: EvidenceCoverageState = "OBSERVED"
  ): TemporalEvidenceBlock => ({
    id,
    startTime: startStr,
    endTime: endStr,
    durationSeconds,
    coverage,
    provenance: [{ source: "desktop_telemetry", authority: "SYSTEM" }],
    observation: {
      application: "Code.exe",
      title: "Task file",
      cleanTitle: "Task file",
      domain: null,
      category: "focused",
      isAfk: false,
      rawEventCount: 10,
    },
    report: null,
    intention: {
      targetScope: "TASK",
      taskId,
      taskTitle: `Task ${taskId}`,
      linkType: "EXPLICIT",
    },
    outcome: null,
  });

  const createBreakBlock = (
    id: string,
    startStr: string,
    endStr: string,
    durationSeconds: number
  ): TemporalEvidenceBlock => ({
    id,
    startTime: startStr,
    endTime: endStr,
    durationSeconds,
    coverage: "OBSERVED",
    provenance: [{ source: "desktop_telemetry", authority: "SYSTEM" }],
    observation: {
      application: "LockScreen",
      title: "Screen Locked",
      cleanTitle: "Screen Locked",
      domain: null,
      category: "break",
      isAfk: true,
      rawEventCount: 1,
    },
    report: null,
    intention: null,
    outcome: null,
  });

  const createUnknownBlock = (
    id: string,
    startStr: string,
    endStr: string,
    durationSeconds: number
  ): TemporalEvidenceBlock => ({
    id,
    startTime: startStr,
    endTime: endStr,
    durationSeconds,
    coverage: "UNKNOWN",
    provenance: [{ source: "unknown_telemetry", authority: "SYSTEM" }],
    observation: null,
    report: null,
    intention: null,
    outcome: null,
  });

  class MockCurrentEpisodesProvider
    implements CurrentTaskEpisodesProvider<TaskExecutionFragmentationMetrics>
  {
    constructor(
      private readonly episodes: EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[]
    ) {}
    async fetchEpisodes(): Promise<
      EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[]
    > {
      return this.episodes;
    }
  }

  class MockBaselineProvider
    implements BaselinePopulationProvider<TaskExecutionBaselineEpisode>
  {
    public readonly populationType = "completed_task_episodes";
    constructor(private readonly episodes: TaskExecutionBaselineEpisode[]) {}
    async fetchPopulation(): Promise<TaskExecutionBaselineEpisode[]> {
      return this.episodes;
    }
  }

  const dummyProvider = new MockCurrentEpisodesProvider([]);
  const dummyBaseline = new MockBaselineProvider([]);

  const createEpisodeContext = (
    blocks: TemporalEvidenceBlock[],
    sessionId: string = "session-1",
    timezone: string = "UTC"
  ): EpisodeExecutionContext => {
    const windowStart = blocks.length > 0 ? blocks[0]!.startTime : "2026-09-01T10:00:00Z";
    const windowEnd =
      blocks.length > 0 ? blocks[blocks.length - 1]!.endTime : "2026-09-01T11:00:00Z";
    const totalDuration = blocks.reduce((acc, b) => acc + b.durationSeconds, 0);

    return {
      level: "EPISODE",
      userId: "user-1",
      timezone,
      canonicalSessionId: sessionId,
      timeline: {
        windowStart,
        windowEnd,
        totalDurationSeconds: totalDuration,
        blocks,
        coverageSummary: {
          totalDurationSeconds: totalDuration,
          observedSeconds: totalDuration,
          reportedSeconds: 0,
          observedReportedSeconds: 0,
          unknownSeconds: 0,
          explainedGapSeconds: 0,
          coverageRatio: 1.0,
        },
      },
      config: mockDetectorConfig,
      generateOperationalMetadata: () => ({
        detectorVersion: "1.0.0",
        configurationVersion: "1.0.0",
        generatedAt: "2026-09-01T12:00:00Z",
      }),
    };
  };

  const createPatternContext = (
    windowStart: string = "2026-09-01T00:00:00Z",
    windowEnd: string = "2026-09-15T00:00:00Z",
    timezone: string = "UTC"
  ): PatternLevelExecutionContext => ({
    level: "PATTERN",
    userId: "user-1",
    timezone,
    timeline: {
      windowStart,
      windowEnd,
      totalDurationSeconds: 14 * 86400,
      blocks: [],
      coverageSummary: {
        totalDurationSeconds: 14 * 86400,
        observedSeconds: 14 * 86400,
        reportedSeconds: 0,
        observedReportedSeconds: 0,
        unknownSeconds: 0,
        explainedGapSeconds: 0,
        coverageRatio: 1.0,
      },
    },
    config: mockDetectorConfig,
    generateOperationalMetadata: () => ({
      detectorVersion: "1.0.0",
      configurationVersion: "1.0.0",
      generatedAt: "2026-09-15T01:00:00Z",
    }),
  });

  const createEpisodeOutput = (
    taskId: string,
    ratio: number,
    startStr: string,
    endStr: string,
    status: EpisodeExecutionStatus = "QUALIFIED"
  ): EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics> => ({
    metadata: {
      evaluationId: `eval-${taskId}-${startStr}`,
      detectorVersion: "1.0.0",
      configurationVersion: "1.0.0",
      generatedAt: "2026-09-15T00:00:00Z",
    },
    userId: "user-1",
    detectorIdentity: "task_execution_fragmentation",
    taxonomy: "context_dynamics",
    executionStatus: status,
    level: "EPISODE",
    attributionMode: "TASK_LINKED",
    temporalWindow: {
      start: startStr,
      end: endStr,
      scale: "TASK_INSTANCE",
    },
    episodeEvidence: {
      sessionId: `session-${taskId}`,
      taskId,
      boundingWindow: {
        start: startStr,
        end: endStr,
      },
    },
    activeDurationSeconds: 1800,
    coverageRatio: 1.0,
    metrics: {
      taskId,
      fragmentCount: ratio > 0 ? 3 : 1,
      wallClockSpanSeconds: 2400,
      activeTaskDurationSeconds: 1800,
      knownInterveningGapSeconds: 2400 * ratio,
      unknownSeconds: 0,
      unknownFraction: 0,
      wallClockFragmentationRatio: ratio,
      medianFragmentDurationSeconds: 600,
      longestFragmentDurationSeconds: 600,
      interquartileFragmentDurationSeconds: 0,
      medianInterveningGapSeconds: ratio > 0 ? 300 : null,
      gapBreakdown: {
        breakSeconds: 2400 * ratio,
        otherTaskSeconds: 0,
        unattributedObservedSeconds: 0,
        explainedGapSeconds: 0,
      },
    },
    epistemicCaveats: [],
  });

  // ==========================================
  // Episode Semantics Tests (Tests 1 - 9)
  // ==========================================

  test("1. One continuous task execution episode -> low/no fragmentation", () => {
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-1"),
      createTaskBlock("b2", "2026-09-01T10:30:00Z", "2026-09-01T11:00:00Z", 1800, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "task-1");
    const result = detector.evaluateEpisode(context, "eval-1");

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.fragmentCount, 1);
    assert.strictEqual(result.metrics.wallClockFragmentationRatio, 0);
    assert.strictEqual(result.metrics.activeTaskDurationSeconds, 3600);
    assert.strictEqual(result.metrics.knownInterveningGapSeconds, 0);
    assert.strictEqual(result.metrics.unknownSeconds, 0);
    assert.strictEqual(result.metrics.medianInterveningGapSeconds, null);
  });

  test("2. Same task executed across multiple authoritative fragments -> fragmentation is measurable", () => {
    // Task 1: 10:00-10:20 (1200s), Break: 10:20-10:30 (600s), Task 1: 10:30-10:50 (1200s), Break: 10:50-11:00 (600s), Task 1: 11:00-11:20 (1200s)
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:20:00Z", 1200, "task-1"),
      createBreakBlock("b2", "2026-09-01T10:20:00Z", "2026-09-01T10:30:00Z", 600),
      createTaskBlock("b3", "2026-09-01T10:30:00Z", "2026-09-01T10:50:00Z", 1200, "task-1"),
      createBreakBlock("b4", "2026-09-01T10:50:00Z", "2026-09-01T11:00:00Z", 600),
      createTaskBlock("b5", "2026-09-01T11:00:00Z", "2026-09-01T11:20:00Z", 1200, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "task-1");
    const result = detector.evaluateEpisode(context, "eval-2");

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.fragmentCount, 3);
    assert.strictEqual(result.metrics.activeTaskDurationSeconds, 3600);
    assert.strictEqual(result.metrics.knownInterveningGapSeconds, 1200);
    assert.strictEqual(result.metrics.wallClockSpanSeconds, 4800);
    assert.strictEqual(result.metrics.wallClockFragmentationRatio, 1200 / 4800); // 0.25
    assert.strictEqual(result.metrics.medianInterveningGapSeconds, 600);
  });

  test("3. Two different tasks are not accidentally merged into one task execution", () => {
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-1"),
      createTaskBlock("b2", "2026-09-01T10:30:00Z", "2026-09-01T11:00:00Z", 1800, "task-2"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);

    const context1 = createEpisodeContext(blocks, "task-1");
    const res1 = detector.evaluateEpisode(context1, "eval-3a");
    assert.strictEqual(res1.metrics.taskId, "task-1");
    assert.strictEqual(res1.metrics.activeTaskDurationSeconds, 1800);

    const context2 = createEpisodeContext(blocks, "task-2");
    const res2 = detector.evaluateEpisode(context2, "eval-3b");
    assert.strictEqual(res2.metrics.taskId, "task-2");
    assert.strictEqual(res2.metrics.activeTaskDurationSeconds, 1800);
  });

  test("4. Missing task attribution is not converted into a fake task ID", () => {
    const nonTaskBlocks = [
      createBreakBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800),
      createBreakBlock("b2", "2026-09-01T10:30:00Z", "2026-09-01T11:00:00Z", 1800),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(nonTaskBlocks, "arbitrary-session");
    const result = detector.evaluateEpisode(context, "eval-4");

    assert.strictEqual(result.executionStatus, "INSUFFICIENT_EVIDENCE");
    assert.strictEqual(result.episodeEvidence.taskId, undefined);
    assert.strictEqual(result.metrics.fragmentCount, 0);
  });

  test("5. UNKNOWN interval does not become fake execution and triggers INDETERMINATE_COVERAGE if > 20%", () => {
    // Task 1: 10:00-10:20 (1200s), UNKNOWN: 10:20-10:50 (1800s, 50% of span), Task 1: 10:50-11:10 (1200s)
    // Span = 4200s, unknown = 1800s -> unknownFraction = 1800 / 4200 = 0.428 > 0.20
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:20:00Z", 1200, "task-1"),
      createUnknownBlock("b2", "2026-09-01T10:20:00Z", "2026-09-01T10:50:00Z", 1800),
      createTaskBlock("b3", "2026-09-01T10:50:00Z", "2026-09-01T11:10:00Z", 1200, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "task-1");
    const result = detector.evaluateEpisode(context, "eval-5");

    assert.strictEqual(result.executionStatus, "INDETERMINATE_COVERAGE");
    assert.strictEqual(result.metrics.unknownSeconds, 1800);
    assert.strictEqual(result.metrics.activeTaskDurationSeconds, 2400); // UNKNOWN is NOT task execution
    assert.strictEqual(result.metrics.knownInterveningGapSeconds, 0); // UNKNOWN is NOT known intervening gap
  });

  test("6. Input ordering does not change result (deterministic sort)", () => {
    const b1 = createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:20:00Z", 1200, "task-1");
    const b2 = createBreakBlock("b2", "2026-09-01T10:20:00Z", "2026-09-01T10:30:00Z", 600);
    const b3 = createTaskBlock("b3", "2026-09-01T10:30:00Z", "2026-09-01T10:50:00Z", 1200, "task-1");

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);

    const contextOriginal = createEpisodeContext([b1, b2, b3], "task-1");
    const resOriginal = detector.evaluateEpisode(contextOriginal, "eval-6");

    const contextShuffled = createEpisodeContext([b3, b1, b2], "task-1");
    const resShuffled = detector.evaluateEpisode(contextShuffled, "eval-6");

    assert.deepStrictEqual(resOriginal.metrics, resShuffled.metrics);
    assert.strictEqual(resOriginal.executionStatus, resShuffled.executionStatus);
  });

  test("7. Terminal execution fragment is retained", () => {
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:15:00Z", 900, "task-1"),
      createBreakBlock("b2", "2026-09-01T10:15:00Z", "2026-09-01T10:30:00Z", 900),
      createTaskBlock("b3", "2026-09-01T10:30:00Z", "2026-09-01T11:00:00Z", 1800, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "task-1");
    const result = detector.evaluateEpisode(context, "eval-7");

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.temporalWindow.end, "2026-09-01T11:00:00Z");
    assert.strictEqual(result.metrics.fragmentCount, 2);
    assert.strictEqual(result.metrics.longestFragmentDurationSeconds, 1800);
  });

  test("8. Zero / empty executable duration is handled safely", () => {
    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext([], "task-1");
    const result = detector.evaluateEpisode(context, "eval-8");

    assert.strictEqual(result.executionStatus, "INSUFFICIENT_EVIDENCE");
    assert.strictEqual(result.metrics.wallClockSpanSeconds, 0);
    assert.strictEqual(result.metrics.activeTaskDurationSeconds, 0);
    assert.strictEqual(result.metrics.wallClockFragmentationRatio, null);
  });

  test("9. Null and undefined metrics remain semantically distinct", () => {
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "task-1");
    const result = detector.evaluateEpisode(context, "eval-9");

    // Single fragment: medianInterveningGapSeconds must be null (not 0, not undefined)
    assert.strictEqual(result.metrics.medianInterveningGapSeconds, null);
    // wallClockFragmentationRatio must be 0 (not null)
    assert.strictEqual(result.metrics.wallClockFragmentationRatio, 0);
  });

  // ==========================================
  // Pattern Semantics Tests (Tests 10 - 19)
  // ==========================================

  const sampleBaselineEpisodes: TaskExecutionBaselineEpisode[] = [
    {
      episodeId: "base-1",
      taskId: "task-1",
      userId: "user-1",
      startedAt: "2026-08-20T10:00:00Z",
      endedAt: "2026-08-20T11:00:00Z",
      wallClockSpanSeconds: 3600,
      activeTaskDurationSeconds: 3600,
      knownInterveningGapSeconds: 0,
      unknownSeconds: 0,
      unknownFraction: 0,
      wallClockFragmentationRatio: 0.05,
      fragmentCount: 1,
      coverageRatio: 1.0,
    },
    {
      episodeId: "base-2",
      taskId: "task-1",
      userId: "user-1",
      startedAt: "2026-08-21T10:00:00Z",
      endedAt: "2026-08-21T11:00:00Z",
      wallClockSpanSeconds: 3600,
      activeTaskDurationSeconds: 3600,
      knownInterveningGapSeconds: 0,
      unknownSeconds: 0,
      unknownFraction: 0,
      wallClockFragmentationRatio: 0.10,
      fragmentCount: 1,
      coverageRatio: 1.0,
    },
    {
      episodeId: "base-3",
      taskId: "task-1",
      userId: "user-1",
      startedAt: "2026-08-22T10:00:00Z",
      endedAt: "2026-08-22T11:00:00Z",
      wallClockSpanSeconds: 3600,
      activeTaskDurationSeconds: 3600,
      knownInterveningGapSeconds: 0,
      unknownSeconds: 0,
      unknownFraction: 0,
      wallClockFragmentationRatio: 0.08,
      fragmentCount: 1,
      coverageRatio: 1.0,
    },
    {
      episodeId: "base-4",
      taskId: "task-1",
      userId: "user-1",
      startedAt: "2026-08-23T10:00:00Z",
      endedAt: "2026-08-23T11:00:00Z",
      wallClockSpanSeconds: 3600,
      activeTaskDurationSeconds: 3600,
      knownInterveningGapSeconds: 0,
      unknownSeconds: 0,
      unknownFraction: 0,
      wallClockFragmentationRatio: 0.12,
      fragmentCount: 1,
      coverageRatio: 1.0,
    },
    {
      episodeId: "base-5",
      taskId: "task-1",
      userId: "user-1",
      startedAt: "2026-08-24T10:00:00Z",
      endedAt: "2026-08-24T11:00:00Z",
      wallClockSpanSeconds: 3600,
      activeTaskDurationSeconds: 3600,
      knownInterveningGapSeconds: 0,
      unknownSeconds: 0,
      unknownFraction: 0,
      wallClockFragmentationRatio: 0.10,
      fragmentCount: 1,
      coverageRatio: 1.0,
    },
  ];

  test("10. Current pattern can be detected against mature baseline (DETECTED)", async () => {
    // Mature baseline median = 0.10
    // Current window: 3 episodes on 2 distinct days with elevated ratio = 0.50
    // delta = 0.50 - 0.10 = 0.40 >= contrastThreshold 0.30
    // elevated fraction = 3 / 3 = 1.0 >= recurrenceThreshold 0.60
    const currentEpisodes: EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[] = [
      createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.55, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.48, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const patternContext = createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z");
    const result = await detector.evaluatePattern(patternContext, "eval-p10", "pattern-10");

    assert.strictEqual(result.executionStatus, "DETECTED");
    assert.strictEqual(result.metrics.elevatedEpisodeFraction, 1.0);
    assert.strictEqual(result.baseline.comparisonStatus, "EVALUATED");
    assert.ok(result.metrics.deltaFragmentation! >= 0.30);
  });

  test("11. Insufficient current evidence does not become DETECTED", async () => {
    // Only 1 episode (requires >= 3)
    const currentEpisodes: EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[] = [
      createEpisodeOutput("task-1", 0.60, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const patternContext = createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z");
    const result = await detector.evaluatePattern(patternContext, "eval-p11", "pattern-11");

    assert.strictEqual(result.executionStatus, "INSUFFICIENT_EVIDENCE");
  });

  test("12. Insufficient baseline data does not become DETECTED", async () => {
    // Only 2 baseline episodes (requires >= 5)
    const sparseBaseline = sampleBaselineEpisodes.slice(0, 2);

    const currentEpisodes: EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[] = [
      createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.55, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.48, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sparseBaseline)
    );

    const patternContext = createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z");
    const result = await detector.evaluatePattern(patternContext, "eval-p12", "pattern-12");

    assert.strictEqual(result.executionStatus, "INSUFFICIENT_BASELINE_DATA");
  });

  test("13. Historical baseline strictly excludes current-window data (anti-leakage)", async () => {
    // Baseline window computed by detector ends at context.timeline.windowStart.
    // If a provider were to attempt to feed leaking data, evaluateBaseline throws.
    class LeakingBaselineProvider
      implements BaselinePopulationProvider<TaskExecutionBaselineEpisode>
    {
      public readonly populationType = "completed_task_episodes";
      async fetchPopulation(): Promise<TaskExecutionBaselineEpisode[]> {
        return sampleBaselineEpisodes;
      }
    }

    const currentEpisodes: EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[] = [
      createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.55, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.48, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new LeakingBaselineProvider()
    );

    const patternContext = createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z");
    const result = await detector.evaluatePattern(patternContext, "eval-p13", "pattern-13");

    // All baseline episodes are in August (strictly before Sept 1)
    assert.strictEqual(result.executionStatus, "DETECTED");
  });

  test("14. Baseline distinct-day maturity respects detector timezone", async () => {
    // 5 baseline sessions happening on the same local calendar day in America/Los_Angeles
    // UTC timestamps: 2026-08-20T04:00:00Z to 2026-08-20T08:00:00Z
    // In UTC: all Aug 20 (1 day).
    // In LA (-7): 2026-08-19 21:00 to 2026-08-20 01:00 (crosses midnight, 2 days).
    const tzEpisodes: TaskExecutionBaselineEpisode[] = [
      {
        episodeId: "tz-1",
        taskId: "task-1",
        userId: "user-1",
        startedAt: "2026-08-20T04:00:00Z", // 21:00 Aug 19 in LA
        endedAt: "2026-08-20T05:00:00Z",
        wallClockSpanSeconds: 3600,
        activeTaskDurationSeconds: 3600,
        knownInterveningGapSeconds: 0,
        unknownSeconds: 0,
        unknownFraction: 0,
        wallClockFragmentationRatio: 0.1,
        fragmentCount: 1,
        coverageRatio: 1.0,
      },
      {
        episodeId: "tz-2",
        taskId: "task-1",
        userId: "user-1",
        startedAt: "2026-08-20T04:30:00Z",
        endedAt: "2026-08-20T05:30:00Z",
        wallClockSpanSeconds: 3600,
        activeTaskDurationSeconds: 3600,
        knownInterveningGapSeconds: 0,
        unknownSeconds: 0,
        unknownFraction: 0,
        wallClockFragmentationRatio: 0.1,
        fragmentCount: 1,
        coverageRatio: 1.0,
      },
      {
        episodeId: "tz-3",
        taskId: "task-1",
        userId: "user-1",
        startedAt: "2026-08-20T08:00:00Z", // 01:00 Aug 20 in LA
        endedAt: "2026-08-20T09:00:00Z",
        wallClockSpanSeconds: 3600,
        activeTaskDurationSeconds: 3600,
        knownInterveningGapSeconds: 0,
        unknownSeconds: 0,
        unknownFraction: 0,
        wallClockFragmentationRatio: 0.1,
        fragmentCount: 1,
        coverageRatio: 1.0,
      },
      {
        episodeId: "tz-4",
        taskId: "task-1",
        userId: "user-1",
        startedAt: "2026-08-20T08:30:00Z",
        endedAt: "2026-08-20T09:30:00Z",
        wallClockSpanSeconds: 3600,
        activeTaskDurationSeconds: 3600,
        knownInterveningGapSeconds: 0,
        unknownSeconds: 0,
        unknownFraction: 0,
        wallClockFragmentationRatio: 0.1,
        fragmentCount: 1,
        coverageRatio: 1.0,
      },
      {
        episodeId: "tz-5",
        taskId: "task-1",
        userId: "user-1",
        startedAt: "2026-08-20T09:00:00Z",
        endedAt: "2026-08-20T10:00:00Z",
        wallClockSpanSeconds: 3600,
        activeTaskDurationSeconds: 3600,
        knownInterveningGapSeconds: 0,
        unknownSeconds: 0,
        unknownFraction: 0,
        wallClockFragmentationRatio: 0.1,
        fragmentCount: 1,
        coverageRatio: 1.0,
      },
    ];

    const currentEpisodes: EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[] = [
      createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.55, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.48, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    // Under UTC: all on Aug 20 (1 day) -> minimum distinct days (2) fails!
    const detectorUTC = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(tzEpisodes)
    );
    const resUTC = await detectorUTC.evaluatePattern(
      createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z", "UTC"),
      "eval-utc",
      "p-utc"
    );
    assert.strictEqual(resUTC.executionStatus, "INSUFFICIENT_BASELINE_DATA");

    // Under America/Los_Angeles: span crosses midnight into 2 days -> passes!
    const detectorLA = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(tzEpisodes)
    );
    const resLA = await detectorLA.evaluatePattern(
      createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z", "America/Los_Angeles"),
      "eval-la",
      "p-la"
    );
    assert.strictEqual(resLA.executionStatus, "DETECTED");
  });

  test("15. Current metrics are surfaced and non-null", async () => {
    const currentEpisodes: EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[] = [
      createEpisodeOutput("task-1", 0.40, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.50, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.60, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const res = await detector.evaluatePattern(
      createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z"),
      "eval-p15",
      "p-15"
    );

    assert.strictEqual(res.metrics.currentMedianFragmentation, 0.50);
    assert.strictEqual(res.metrics.currentMedianActiveDurationSeconds, 1800);
    assert.strictEqual(res.metrics.currentMedianFragmentCount, 3);
    assert.strictEqual(res.metrics.deltaFragmentation, 0.40); // 0.50 - 0.10
  });

  test("16. Recurrence frequency is surfaced", async () => {
    // 2 elevated out of 3 total -> 2/3 = 0.6666...
    const currentEpisodes: EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[] = [
      createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"), // elevated (> 0.10)
      createEpisodeOutput("task-1", 0.05, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"), // not elevated
      createEpisodeOutput("task-1", 0.60, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"), // elevated (> 0.10)
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const res = await detector.evaluatePattern(
      createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z"),
      "eval-p16",
      "p-16"
    );

    assert.strictEqual(res.metrics.elevatedEpisodeFraction, 2 / 3);
  });

  test("17. Contributing task IDs and session IDs are deterministically ordered", async () => {
    const currentEpisodes: EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[] = [
      createEpisodeOutput("task-z", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-a", 0.50, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-m", 0.50, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const res = await detector.evaluatePattern(
      createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z"),
      "eval-p17",
      "p-17"
    );

    assert.deepStrictEqual(res.evidenceReferences.contributingTaskIds, ["task-a", "task-m", "task-z"]);
  });

  test("18. Current-vs-baseline comparison uses signed relative change when baseline > 0", async () => {
    // Current median = 0.30, baseline = 0.10 -> relative change = (0.30 - 0.10) / 0.10 = +2.0
    const currentEpisodes: EpisodeMeasurementOutput<TaskExecutionFragmentationMetrics>[] = [
      createEpisodeOutput("task-1", 0.30, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.30, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.30, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const res = await detector.evaluatePattern(
      createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z"),
      "eval-p18",
      "p-18"
    );

    assert.strictEqual(res.baseline.comparisonStatus, "EVALUATED");
    assert.ok(Math.abs((res.baseline.deltaRatio ?? 0) - 2.0) < 1e-6);
  });

  test("19. Input shuffling does not change pattern decision or metrics", async () => {
    const ep1 = createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z");
    const ep2 = createEpisodeOutput("task-1", 0.55, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z");
    const ep3 = createEpisodeOutput("task-1", 0.48, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z");

    const detector1 = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider([ep1, ep2, ep3]),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const detector2 = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider([ep3, ep1, ep2]),
      new MockBaselineProvider([...sampleBaselineEpisodes].reverse())
    );

    const patternContext = createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z");

    const res1 = await detector1.evaluatePattern(patternContext, "eval-p19a", "p-19");
    const res2 = await detector2.evaluatePattern(patternContext, "eval-p19b", "p-19");

    assert.strictEqual(res1.executionStatus, res2.executionStatus);
    assert.deepStrictEqual(res1.metrics, res2.metrics);
    assert.deepStrictEqual(res1.evidenceReferences, res2.evidenceReferences);
  });

  // ==========================================
  // Real-World Edge Cases
  // ==========================================

  test("Real-world edge case: 09:00-09:20, 09:45-10:05, 11:00-11:15 vs continuous 09:00-10:00", () => {
    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);

    // Fragmented task execution: 3 fragments with 25m and 55m gaps
    const fragmentedBlocks = [
      createTaskBlock("f1", "2026-09-01T09:00:00Z", "2026-09-01T09:20:00Z", 1200, "task-A"),
      createBreakBlock("b1", "2026-09-01T09:20:00Z", "2026-09-01T09:45:00Z", 1500),
      createTaskBlock("f2", "2026-09-01T09:45:00Z", "2026-09-01T10:05:00Z", 1200, "task-A"),
      createBreakBlock("b2", "2026-09-01T10:05:00Z", "2026-09-01T11:00:00Z", 3300),
      createTaskBlock("f3", "2026-09-01T11:00:00Z", "2026-09-01T11:15:00Z", 900, "task-A"),
    ];

    const fragmentedContext = createEpisodeContext(fragmentedBlocks, "task-A");
    const fragRes = detector.evaluateEpisode(fragmentedContext, "eval-frag");

    assert.strictEqual(fragRes.executionStatus, "QUALIFIED");
    assert.strictEqual(fragRes.metrics.fragmentCount, 3);
    assert.strictEqual(fragRes.metrics.activeTaskDurationSeconds, 3300);
    assert.strictEqual(fragRes.metrics.knownInterveningGapSeconds, 4800);
    assert.strictEqual(fragRes.metrics.wallClockSpanSeconds, 8100);
    assert.strictEqual(fragRes.metrics.wallClockFragmentationRatio, 4800 / 8100); // ~0.5925

    // Continuous execution: 1 fragment 09:00-10:00 (3600s)
    const continuousBlocks = [
      createTaskBlock("c1", "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z", 3600, "task-A"),
    ];
    const continuousContext = createEpisodeContext(continuousBlocks, "task-A");
    const contRes = detector.evaluateEpisode(continuousContext, "eval-cont");

    assert.strictEqual(contRes.executionStatus, "QUALIFIED");
    assert.strictEqual(contRes.metrics.fragmentCount, 1);
    assert.strictEqual(contRes.metrics.activeTaskDurationSeconds, 3600);
    assert.strictEqual(contRes.metrics.wallClockFragmentationRatio, 0);

    // Clear concentration difference:
    assert.strictEqual(contRes.metrics.medianFragmentDurationSeconds, 3600);
    assert.strictEqual(fragRes.metrics.medianFragmentDurationSeconds, 1200);
  });

  test("Real-world edge case: Task A (09:00-09:30), UNKNOWN (09:30-10:30), Task A (10:30-11:00) is INDETERMINATE", () => {
    // 30m Task A + 60m UNKNOWN + 30m Task A
    // Span = 120m = 7200s, unknown = 3600s -> unknownFraction = 3600 / 7200 = 50% > 20%
    const blocks = [
      createTaskBlock("b1", "2026-09-01T09:00:00Z", "2026-09-01T09:30:00Z", 1800, "task-A"),
      createUnknownBlock("b2", "2026-09-01T09:30:00Z", "2026-09-01T10:30:00Z", 3600),
      createTaskBlock("b3", "2026-09-01T10:30:00Z", "2026-09-01T11:00:00Z", 1800, "task-A"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "task-A");
    const res = detector.evaluateEpisode(context, "eval-unknown");

    // Must NOT conclude Task A was interrupted or fragmented
    assert.strictEqual(res.executionStatus, "INDETERMINATE_COVERAGE");
    assert.strictEqual(res.metrics.unknownFraction, 0.5);
  });
});
