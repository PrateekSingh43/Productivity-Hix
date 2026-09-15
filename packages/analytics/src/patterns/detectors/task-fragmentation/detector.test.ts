import { test, describe } from "node:test";
import assert from "node:assert";
import { TaskFragmentationDetector } from "./detector";
import type {
  TaskFragmentationConfig,
  TaskExecutionFragmentationMetrics,
  TaskExecutionBaselineEpisode,
  CurrentTaskEpisodesProvider,
} from "./types";
import type {
  TemporalEvidenceBlock,
  EpisodeMeasurementOutput,
  EvidenceCoverageState,
  EpisodeExecutionStatus,
  TaskWithSessions,
} from "@repo/types";
import type {
  EpisodeExecutionContext,
  PatternLevelExecutionContext,
  DetectorConfiguration,
} from "../../base/context";
import type { BaselinePopulationProvider } from "../../baseline/source";
import {
  TaskExecutionBaselineProvider,
  type TaskWorkSessionsDataSource,
} from "./provider";

describe("Detector 2: detector.ts", () => {
  const config: TaskFragmentationConfig = {
    continuationGapThresholdSeconds: 7200, // 2 hours
    maxUnknownFraction: 0.20, // 20%
    minimumEpisodeActiveDurationSeconds: 600, // 10 minutes
    minimumQualifyingEpisodes: 3,
    minimumQualifyingCalendarDays: 2,
    minimumBaselineDays: 14,
    minimumBaselineEpisodes: 5,
    minimumBaselineDistinctDays: 2,
    baselineStrategy: "ROLLING_14_DAY_WINDOW",
    fragmentationContrastThreshold: 0.30,
    fragmentationRecurrenceThreshold: 0.60,
    minimumPatternCoverageRatio: 0.80,
  };

  const mockDetectorConfig: DetectorConfiguration = {
    detectorIdentity: "task_execution_fragmentation",
    detectorVersion: "1.0.0",
    configurationVersion: "1.0.0",
    attributionMode: "TASK_LINKED",
    baselineStrategy: "ROLLING_14_DAY_WINDOW",
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
    targetTaskId?: string,
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
      targetTaskId,
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

  // ==========================================
  // Episode Semantics (Mandatory Cases 1 - 11)
  // ==========================================

  test("1. one continuous task execution", () => {
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-1"),
      createTaskBlock("b2", "2026-09-01T10:30:00Z", "2026-09-01T11:00:00Z", 1800, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "sess-1", "task-1");
    const result = detector.evaluateEpisode(context, "eval-1");

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.fragmentCount, 1);
    assert.strictEqual(result.metrics.wallClockFragmentationRatio, 0);
    assert.strictEqual(result.metrics.activeTaskDurationSeconds, 3600);
    assert.strictEqual(result.metrics.knownInterveningGapSeconds, 0);
  });

  test("2. same task split into multiple fragments", () => {
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:20:00Z", 1200, "task-1"),
      createBreakBlock("b2", "2026-09-01T10:20:00Z", "2026-09-01T10:30:00Z", 600),
      createTaskBlock("b3", "2026-09-01T10:30:00Z", "2026-09-01T10:50:00Z", 1200, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "sess-1", "task-1");
    const result = detector.evaluateEpisode(context, "eval-2");

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.fragmentCount, 2);
    assert.strictEqual(result.metrics.activeTaskDurationSeconds, 2400);
    assert.strictEqual(result.metrics.knownInterveningGapSeconds, 600);
    assert.strictEqual(result.metrics.wallClockSpanSeconds, 3000);
    assert.strictEqual(result.metrics.wallClockFragmentationRatio, 600 / 3000); // 0.20
  });

  test("3. two different tasks are kept separate", () => {
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-1"),
      createTaskBlock("b2", "2026-09-01T10:30:00Z", "2026-09-01T11:00:00Z", 1800, "task-2"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);

    const res1 = detector.evaluateEpisode(createEpisodeContext(blocks, "s1", "task-1"), "eval-3a");
    assert.strictEqual(res1.metrics.taskId, "task-1");
    assert.strictEqual(res1.metrics.activeTaskDurationSeconds, 1800);

    const res2 = detector.evaluateEpisode(createEpisodeContext(blocks, "s2", "task-2"), "eval-3b");
    assert.strictEqual(res2.metrics.taskId, "task-2");
    assert.strictEqual(res2.metrics.activeTaskDurationSeconds, 1800);
  });

  test("4. multiple authoritative tasks with no target task -> no arbitrary selection", () => {
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-A"),
      createTaskBlock("b2", "2026-09-01T10:30:00Z", "2026-09-01T11:00:00Z", 1800, "task-B"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    // No targetTaskId supplied
    const context = createEpisodeContext(blocks, "sess-1", undefined);
    const result = detector.evaluateEpisode(context, "eval-4");

    // Must return explicit INSUFFICIENT_EVIDENCE without picking task-A arbitrarily
    assert.strictEqual(result.executionStatus, "INSUFFICIENT_EVIDENCE");
    assert.ok(result.epistemicCaveats.some((c) => c.includes("Ambiguous task context")));
    assert.strictEqual(result.metrics.fragmentCount, 0);
  });

  test("5. session ID is never interpreted as task ID", () => {
    const blocks = [
      createBreakBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    // Canonical session ID is "sess-999" (no task links in blocks)
    const context = createEpisodeContext(blocks, "sess-999", undefined);
    const result = detector.evaluateEpisode(context, "eval-5");

    assert.strictEqual(result.executionStatus, "INSUFFICIENT_EVIDENCE");
    assert.strictEqual(result.episodeEvidence.taskId, undefined);
  });

  test("6. one bounded context maps to one bounded execution episode", () => {
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "s1", "task-1");
    const result = detector.evaluateEpisode(context, "eval-6");

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.fragmentCount, 1);
  });

  test("7. multiple bounded episodes are not silently reduced to episodes[0]", () => {
    // 2 bounded episodes separated by 3 hours (> continuationGapThreshold 7200s)
    const blocks = [
      createTaskBlock("b1", "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z", 3600, "task-1"),
      createBreakBlock("b2", "2026-09-01T10:00:00Z", "2026-09-01T13:00:00Z", 10800),
      createTaskBlock("b3", "2026-09-01T13:00:00Z", "2026-09-01T14:00:00Z", 3600, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "s1", "task-1");
    const result = detector.evaluateEpisode(context, "eval-7");

    // Must NOT silently use episodes[0]. Rejects multi-episode context with explicit caveat.
    assert.strictEqual(result.executionStatus, "INSUFFICIENT_EVIDENCE");
    assert.ok(
      result.epistemicCaveats.some((c) =>
        c.includes("Multiple bounded task execution episodes detected within a single EpisodeExecutionContext")
      )
    );
  });

  test("8. UNKNOWN interval remains UNKNOWN", () => {
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-1"),
      createUnknownBlock("b2", "2026-09-01T10:30:00Z", "2026-09-01T10:40:00Z", 600),
      createTaskBlock("b3", "2026-09-01T10:40:00Z", "2026-09-01T11:00:00Z", 1200, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "s1", "task-1");
    const result = detector.evaluateEpisode(context, "eval-8");

    // unknown is 600s out of 3600s span (16.6% <= 20%) -> QUALIFIED
    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.unknownSeconds, 600);
    assert.strictEqual(result.metrics.knownInterveningGapSeconds, 0); // UNKNOWN is NOT known gap
    assert.strictEqual(result.metrics.wallClockFragmentationRatio, 0);
  });

  test("9. UNKNOWN-heavy episode can become INDETERMINATE_COVERAGE", () => {
    // 50% unknown (> 20%)
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-1"),
      createUnknownBlock("b2", "2026-09-01T10:30:00Z", "2026-09-01T11:30:00Z", 3600),
      createTaskBlock("b3", "2026-09-01T11:30:00Z", "2026-09-01T12:00:00Z", 1800, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "s1", "task-1");
    const result = detector.evaluateEpisode(context, "eval-9");

    assert.strictEqual(result.executionStatus, "INDETERMINATE_COVERAGE");
    assert.strictEqual(result.metrics.unknownFraction, 0.5);
  });

  test("10. no uncovered wall-clock interval disappears silently", () => {
    // Hole with NO evidence blocks between 10:20 and 10:40 (1200s)
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:20:00Z", 1200, "task-1"),
      createTaskBlock("b2", "2026-09-01T10:40:00Z", "2026-09-01T11:00:00Z", 1200, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "s1", "task-1");
    const result = detector.evaluateEpisode(context, "eval-10");

    // Uncovered interval is accounted for as unknownSeconds
    assert.strictEqual(result.metrics.unknownSeconds, 1200);
    assert.strictEqual(result.metrics.wallClockSpanSeconds, 3600);
  });

  test("11. interval accounting conserves the bounded episode span", () => {
    const blocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:20:00Z", 1200, "task-1"),
      createBreakBlock("b2", "2026-09-01T10:20:00Z", "2026-09-01T10:30:00Z", 600),
      createTaskBlock("b3", "2026-09-01T10:40:00Z", "2026-09-01T11:00:00Z", 1200, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const context = createEpisodeContext(blocks, "s1", "task-1");
    const result = detector.evaluateEpisode(context, "eval-11");

    const m = result.metrics;
    assert.strictEqual(
      m.wallClockSpanSeconds,
      m.activeTaskDurationSeconds + m.knownInterveningGapSeconds + m.unknownSeconds
    );
  });

  // ==========================================
  // Pattern Semantics (Mandatory Cases 12 - 25)
  // ==========================================

  test("12. deterministic under shuffled evidence order", () => {
    const b1 = createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:20:00Z", 1200, "task-1");
    const b2 = createBreakBlock("b2", "2026-09-01T10:20:00Z", "2026-09-01T10:30:00Z", 600);
    const b3 = createTaskBlock("b3", "2026-09-01T10:30:00Z", "2026-09-01T10:50:00Z", 1200, "task-1");

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const res1 = detector.evaluateEpisode(createEpisodeContext([b1, b2, b3], "s1", "task-1"), "eval-12a");
    const res2 = detector.evaluateEpisode(createEpisodeContext([b3, b1, b2], "s1", "task-1"), "eval-12b");

    assert.deepStrictEqual(res1.metrics, res2.metrics);
  });

  test("13. deterministic under shuffled baseline ordering", async () => {
    const currentEpisodes = [
      createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.55, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.48, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector1 = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const detector2 = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider([...sampleBaselineEpisodes].reverse())
    );

    const ctx = createPatternContext();
    const res1 = await detector1.evaluatePattern(ctx, "eval-13a", "p-13");
    const res2 = await detector2.evaluatePattern(ctx, "eval-13b", "p-13");

    assert.strictEqual(res1.executionStatus, res2.executionStatus);
    assert.deepStrictEqual(res1.metrics, res2.metrics);
  });

  test("14. baseline excludes evaluation window", async () => {
    // Current window starts at 2026-09-01T00:00:00Z
    // If a baseline item ends after evaluation start, evaluateBaseline throws leakage error
    const leakingBaseline: TaskExecutionBaselineEpisode[] = [
      {
        ...sampleBaselineEpisodes[0]!,
        startedAt: "2026-09-02T10:00:00Z", // Inside evaluation window!
        endedAt: "2026-09-02T11:00:00Z",
      },
    ];

    const currentEpisodes = [
      createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.55, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.48, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(leakingBaseline)
    );

    // Baseline window computed by detector ends at context.timeline.windowStart (2026-09-01T00:00:00Z)
    // The provider's items leaking beyond that will be filtered or flagged
    const ctx = createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z");
    const res = await detector.evaluatePattern(ctx, "eval-14", "p-14");

    // The leaking item occurred on Sept 2, so in [Aug 18, Sept 1) there are 0 qualifying items -> INSUFFICIENT_BASELINE_DATA
    assert.strictEqual(res.executionStatus, "INSUFFICIENT_BASELINE_DATA");
  });

  test("15. baseline uses authoritative timezone", async () => {
    // 5 sessions across midnight in America/Los_Angeles (crosses into 2 days)
    // In UTC: all on same day Aug 20 (only 1 day -> fails minDistinctDays 2)
    const tzEpisodes: TaskExecutionBaselineEpisode[] = [
      {
        episodeId: "tz-1",
        taskId: "task-1",
        userId: "user-1",
        startedAt: "2026-08-20T04:00:00Z", // Aug 19 21:00 in LA
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
        startedAt: "2026-08-20T08:00:00Z", // Aug 20 01:00 in LA
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

    const currentEpisodes = [
      createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.55, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.48, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    // Under UTC: 1 distinct day -> fails minimumBaselineDistinctDays 2
    const detUTC = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(tzEpisodes)
    );
    const resUTC = await detUTC.evaluatePattern(
      createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z", "UTC"),
      "eval-utc",
      "p-utc"
    );
    assert.strictEqual(resUTC.executionStatus, "INSUFFICIENT_BASELINE_DATA");

    // Under America/Los_Angeles: 2 distinct days -> passes!
    const detLA = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(tzEpisodes)
    );
    const resLA = await detLA.evaluatePattern(
      createPatternContext("2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z", "America/Los_Angeles"),
      "eval-la",
      "p-la"
    );
    assert.strictEqual(resLA.executionStatus, "DETECTED");
  });

  test("16. baseline maturity checks episode count", async () => {
    // 3 episodes < minimumBaselineEpisodes 5
    const sparse = sampleBaselineEpisodes.slice(0, 3);
    const currentEpisodes = [
      createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.55, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.48, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sparse)
    );

    const res = await detector.evaluatePattern(createPatternContext(), "eval-16", "p-16");
    assert.strictEqual(res.executionStatus, "INSUFFICIENT_BASELINE_DATA");
  });

  test("17. baseline maturity checks distinct local calendar days", async () => {
    // 5 episodes all on the exact same calendar day in UTC
    const sameDayEpisodes = sampleBaselineEpisodes.map((e) => ({
      ...e,
      startedAt: "2026-08-20T10:00:00Z",
      endedAt: "2026-08-20T11:00:00Z",
    }));

    const currentEpisodes = [
      createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.55, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.48, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sameDayEpisodes)
    );

    const res = await detector.evaluatePattern(createPatternContext(), "eval-17", "p-17");
    assert.strictEqual(res.executionStatus, "INSUFFICIENT_BASELINE_DATA");
  });

  test("18. baseline strategy label matches actual implementation", async () => {
    const currentEpisodes = [
      createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.55, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.48, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const res = await detector.evaluatePattern(createPatternContext(), "eval-18", "p-18");
    // Truthful baseline strategy: "ROLLING_14_DAY_WINDOW", never untruthful "SAME_TASK_TYPE"
    assert.strictEqual(res.baseline.strategy, "ROLLING_14_DAY_WINDOW");
  });

  test("19. current metrics are surfaced", async () => {
    const currentEpisodes = [
      createEpisodeOutput("task-1", 0.40, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.50, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.60, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const res = await detector.evaluatePattern(createPatternContext(), "eval-19", "p-19");
    assert.strictEqual(res.metrics.currentMedianFragmentation, 0.50);
    assert.strictEqual(res.metrics.currentMedianActiveDurationSeconds, 1800);
    assert.strictEqual(res.metrics.currentMedianFragmentCount, 3);
  });

  test("20. baseline metrics are surfaced", async () => {
    const currentEpisodes = [
      createEpisodeOutput("task-1", 0.40, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.50, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.60, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const res = await detector.evaluatePattern(createPatternContext(), "eval-20", "p-20");
    assert.strictEqual(res.baseline.baselineValue, 0.10);
    assert.strictEqual(res.baseline.currentValue, 0.50);
    assert.strictEqual(res.baseline.comparisonStatus, "EVALUATED");
  });

  test("21. recurrence is surfaced", async () => {
    // 2 elevated out of 3 total -> 2/3
    const currentEpisodes = [
      createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.05, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.60, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const res = await detector.evaluatePattern(createPatternContext(), "eval-21", "p-21");
    assert.strictEqual(res.metrics.elevatedEpisodeFraction, 2 / 3);
  });

  test("22. contribution IDs are deterministic", async () => {
    const currentEpisodes = [
      createEpisodeOutput("task-z", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-a", 0.50, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-m", 0.50, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const res = await detector.evaluatePattern(createPatternContext(), "eval-22", "p-22");
    assert.deepStrictEqual(res.evidenceReferences.contributingTaskIds, ["task-a", "task-m", "task-z"]);
  });

  test("23. insufficient current evidence does not become DETECTED", async () => {
    // Only 2 episodes (requires >= 3)
    const currentEpisodes = [
      createEpisodeOutput("task-1", 0.60, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.60, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sampleBaselineEpisodes)
    );

    const res = await detector.evaluatePattern(createPatternContext(), "eval-23", "p-23");
    assert.strictEqual(res.executionStatus, "INSUFFICIENT_EVIDENCE");
  });

  test("24. insufficient baseline evidence does not become DETECTED", async () => {
    const sparse = sampleBaselineEpisodes.slice(0, 2);
    const currentEpisodes = [
      createEpisodeOutput("task-1", 0.50, "2026-09-02T10:00:00Z", "2026-09-02T11:00:00Z"),
      createEpisodeOutput("task-1", 0.55, "2026-09-02T14:00:00Z", "2026-09-02T15:00:00Z"),
      createEpisodeOutput("task-1", 0.48, "2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"),
    ];

    const detector = new TaskFragmentationDetector(
      config,
      new MockCurrentEpisodesProvider(currentEpisodes),
      new MockBaselineProvider(sparse)
    );

    const res = await detector.evaluatePattern(createPatternContext(), "eval-24", "p-24");
    assert.strictEqual(res.executionStatus, "INSUFFICIENT_BASELINE_DATA");
  });

  test("25. zero/null/undefined semantics are handled correctly", async () => {
    const singleFragBlocks = [
      createTaskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-1"),
    ];

    const detector = new TaskFragmentationDetector(config, dummyProvider, dummyBaseline);
    const epRes = detector.evaluateEpisode(createEpisodeContext(singleFragBlocks, "s1", "task-1"), "eval-25a");

    // Single fragment: ratio is 0 (number), medianInterveningGapSeconds is null (not undefined, not 0)
    assert.strictEqual(epRes.metrics.wallClockFragmentationRatio, 0);
    assert.strictEqual(epRes.metrics.medianInterveningGapSeconds, null);

    // Empty episode: ratio is null
    const emptyRes = detector.evaluateEpisode(createEpisodeContext([], "s1", "task-1"), "eval-25b");
    assert.strictEqual(emptyRes.metrics.wallClockFragmentationRatio, null);
  });

  // ==========================================
  // Real Production Baseline Provider Integration
  // ==========================================

  test("TaskExecutionBaselineProvider: derives bounded episodes from authoritative TaskWithSessions data", async () => {
    class MockWorkSessionsDataSource implements TaskWorkSessionsDataSource {
      async findTasksWithSessions(userId: string): Promise<TaskWithSessions[]> {
        return [
          {
            id: "task-A",
            userId,
            title: "Task A",
            description: null,
            status: "done",
            priority: "medium",
            plannedDurationMinutes: 60,
            dueAt: null,
            completedAt: "2026-08-25T17:00:00Z",
            createdAt: "2026-08-20T00:00:00Z",
            updatedAt: "2026-08-25T17:00:00Z",
            sessions: [
              // Episode 1 (Aug 21): 2 sessions with 15m gap (<= 2h continuation threshold)
              {
                id: "sess-A1",
                startedAt: "2026-08-21T10:00:00Z",
                endedAt: "2026-08-21T10:30:00Z",
                durationSeconds: 1800,
                isPaused: false,
                lastResumedAt: null,
                notes: null,
              },
              {
                id: "sess-A2",
                startedAt: "2026-08-21T10:45:00Z",
                endedAt: "2026-08-21T11:15:00Z",
                durationSeconds: 1800,
                isPaused: false,
                lastResumedAt: null,
                notes: null,
              },
              // Episode 2 (Aug 22): Next day -> day close splits into a separate episode!
              {
                id: "sess-A3",
                startedAt: "2026-08-22T14:00:00Z",
                endedAt: "2026-08-22T15:00:00Z",
                durationSeconds: 3600,
                isPaused: false,
                lastResumedAt: null,
                notes: null,
              },
            ],
          },
          {
            id: "task-B",
            userId,
            title: "Task B (0 sessions)",
            description: null,
            status: "todo",
            priority: "low",
            plannedDurationMinutes: 30,
            dueAt: null,
            completedAt: null,
            createdAt: "2026-08-20T00:00:00Z",
            updatedAt: "2026-08-20T00:00:00Z",
            sessions: [], // 0 sessions -> 0 episodes
          },
        ];
      }
    }

    const provider = new TaskExecutionBaselineProvider(new MockWorkSessionsDataSource(), {
      continuationGapThresholdSeconds: 7200,
      timezone: "UTC",
    });

    const window = {
      start: "2026-08-18T00:00:00Z",
      end: "2026-09-01T00:00:00Z",
    };

    const episodes = await provider.fetchPopulation("user-1", window);

    // CRITICAL: Task rows ≠ execution episodes. Task A had 3 sessions and produced 2 bounded episodes!
    // Task B had 0 sessions and produced 0 episodes! Total = 2 episodes.
    assert.strictEqual(episodes.length, 2);

    const ep1 = episodes[0]!;
    assert.strictEqual(ep1.taskId, "task-A");
    assert.strictEqual(ep1.fragmentCount, 2);
    assert.strictEqual(ep1.activeTaskDurationSeconds, 3600);
    assert.strictEqual(ep1.knownInterveningGapSeconds, 900); // 15m = 900s
    assert.strictEqual(ep1.wallClockSpanSeconds, 4500); // 10:00 to 11:15 = 75m = 4500s
    assert.strictEqual(ep1.wallClockFragmentationRatio, 900 / 4500); // 0.20

    const ep2 = episodes[1]!;
    assert.strictEqual(ep2.taskId, "task-A");
    assert.strictEqual(ep2.fragmentCount, 1);
    assert.strictEqual(ep2.activeTaskDurationSeconds, 3600);
    assert.strictEqual(ep2.wallClockSpanSeconds, 3600);
    assert.strictEqual(ep2.wallClockFragmentationRatio, 0);
  });
});
