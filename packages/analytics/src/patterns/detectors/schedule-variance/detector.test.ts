import { test, describe } from "node:test";
import assert from "node:assert";
import { ScheduleVarianceDetector } from "./detector";
import type { ScheduleVarianceConfig, TaskScheduleInstance } from "./types";
import type { EpisodeExecutionContext, PatternLevelExecutionContext } from "../../base/context";

describe("Detector 4: Schedule Variance Detector", () => {
  const defaultConfig: ScheduleVarianceConfig = {
    onTimeToleranceSeconds: 300, // 5 minutes
    minimumQualifyingTaskInstances: 5,
    minimumDistinctCalendarDays: 3,
    minimumPatternCoverageRatio: 0.8,
    delayedStartFractionThreshold: 0.5,
    detectorVersion: "1.0.0",
    configurationVersion: "1.0.0",
  };

  const createEpisodeContext = (targetTaskId = "task-1"): EpisodeExecutionContext => ({
    userId: "user-123",
    canonicalSessionId: "session-1",
    timezone: "UTC",
    level: "EPISODE",
    targetTaskId,
    timeline: {
      windowStart: "2026-09-15T00:00:00.000Z",
      windowEnd: "2026-09-15T23:59:59.000Z",
      totalDurationSeconds: 86400,
      blocks: [],
      coverageSummary: {
        totalDurationSeconds: 86400,
        observedSeconds: 0,
        reportedSeconds: 0,
        observedReportedSeconds: 0,
        explainedGapSeconds: 0,
        unknownSeconds: 0,
        coverageRatio: 1,
      },
    },
    config: {
      detectorIdentity: "schedule_variance_episode",
      detectorVersion: "1.0.0",
      configurationVersion: "1.0.0",
      attributionMode: "TASK_LINKED",
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

  const createPatternContext = (timezone = "UTC"): PatternLevelExecutionContext => ({
    userId: "user-123",
    timezone,
    level: "PATTERN",
    timeline: {
      windowStart: "2026-09-01T00:00:00.000Z",
      windowEnd: "2026-09-15T00:00:00.000Z",
      totalDurationSeconds: 14 * 86400,
      blocks: [],
      coverageSummary: {
        totalDurationSeconds: 86400,
        observedSeconds: 0,
        reportedSeconds: 0,
        observedReportedSeconds: 0,
        explainedGapSeconds: 0,
        unknownSeconds: 0,
        coverageRatio: 1,
      },
    },
    config: {
      detectorIdentity: "schedule_variance",
      detectorVersion: "1.0.0",
      configurationVersion: "1.0.0",
      attributionMode: "TASK_LINKED",
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

  // Test 1 — exact on time
  test("Test 1: exact on time: planned 10:00, actual 10:00 -> delta = 0, classification = ON_TIME", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-1",
      plannedStart: "2026-09-15T10:00:00.000Z",
      sessions: [
        {
          id: "s1",
          startedAt: "2026-09-15T10:00:00.000Z",
          endedAt: "2026-09-15T10:30:00.000Z",
        },
      ],
    };

    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-1", instance);

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.startDeltaSeconds, 0);
    assert.strictEqual(result.metrics.startDeltaMinutes, 0);
    assert.strictEqual(result.metrics.deltaRatio, null); // Strictly null
    assert.strictEqual(result.metrics.classification, "ON_TIME");
    assert.strictEqual(result.metrics.status, "OBSERVED");
  });

  // Test 2 — late
  test("Test 2: late: planned 10:00, actual 10:17 -> +1020s, classification = LATE", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-2",
      plannedStart: "2026-09-15T10:00:00.000Z",
      sessions: [
        {
          id: "s1",
          startedAt: "2026-09-15T10:17:00.000Z",
          endedAt: "2026-09-15T10:50:00.000Z",
        },
      ],
    };

    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-2", instance);

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.startDeltaSeconds, 1020);
    assert.strictEqual(result.metrics.startDeltaMinutes, 17);
    assert.strictEqual(result.metrics.deltaRatio, null);
    assert.strictEqual(result.metrics.classification, "LATE");
  });

  // Test 3 — early
  test("Test 3: early: planned 10:00, actual 09:52 -> -480s, classification = EARLY", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-3",
      plannedStart: "2026-09-15T10:00:00.000Z",
      sessions: [
        {
          id: "s1",
          startedAt: "2026-09-15T09:52:00.000Z",
          endedAt: "2026-09-15T10:30:00.000Z",
        },
      ],
    };

    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-3", instance);

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.startDeltaSeconds, -480);
    assert.strictEqual(result.metrics.startDeltaMinutes, -8);
    assert.strictEqual(result.metrics.deltaRatio, null);
    assert.strictEqual(result.metrics.classification, "EARLY");
  });

  // Test 4 — tolerance boundary
  test("Test 4: tolerance boundary: exactly +5m (300s) is ON_TIME with tolerance = 300s", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-4",
      plannedStart: "2026-09-15T10:00:00.000Z",
      sessions: [
        {
          id: "s1",
          startedAt: "2026-09-15T10:05:00.000Z",
          endedAt: "2026-09-15T10:30:00.000Z",
        },
      ],
    };

    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-4", instance);

    assert.strictEqual(result.metrics.startDeltaSeconds, 300);
    assert.strictEqual(result.metrics.classification, "ON_TIME");
  });

  // Test 5 — just outside tolerance
  test("Test 5: just outside tolerance: +5m01s (301s) is LATE with tolerance = 300s", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-5",
      plannedStart: "2026-09-15T10:00:00.000Z",
      sessions: [
        {
          id: "s1",
          startedAt: "2026-09-15T10:05:01.000Z",
          endedAt: "2026-09-15T10:30:00.000Z",
        },
      ],
    };

    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-5", instance);

    assert.strictEqual(result.metrics.startDeltaSeconds, 301);
    assert.strictEqual(result.metrics.classification, "LATE");
  });

  // Test 6 — missing plannedStart
  test("Test 6: missing plannedStart -> INSUFFICIENT_EVIDENCE, delta = null, caveat flagged", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-6",
      plannedStart: null,
      sessions: [
        {
          id: "s1",
          startedAt: "2026-09-15T10:15:00.000Z",
          endedAt: "2026-09-15T10:30:00.000Z",
        },
      ],
    };

    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-6", instance);

    assert.strictEqual(result.executionStatus, "INSUFFICIENT_EVIDENCE");
    assert.strictEqual(result.metrics.startDeltaSeconds, null);
    assert.strictEqual(result.metrics.deltaRatio, null);
    assert.strictEqual(result.metrics.status, "NO_PLANNED_START");
    assert.ok(result.epistemicCaveats.includes("NO_AUTHORITATIVE_PLANNED_START"));
  });

  // Test 7 — missing actual execution
  test("Test 7: missing actual execution -> INSUFFICIENT_EVIDENCE, delta = null, caveat flagged", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-7",
      plannedStart: "2026-09-15T10:00:00.000Z",
      sessions: [],
    };

    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-7", instance);

    assert.strictEqual(result.executionStatus, "INSUFFICIENT_EVIDENCE");
    assert.strictEqual(result.metrics.startDeltaSeconds, null);
    assert.strictEqual(result.metrics.actualStart, null);
    assert.strictEqual(result.metrics.status, "NOT_OBSERVED");
    assert.ok(result.epistemicCaveats.includes("NO_ACTUAL_EXECUTION_OBSERVED"));
  });

  // Test 8 — multiple execution sessions
  test("Test 8: multiple execution sessions uses earliest qualifying session (10:20 vs 14:00)", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-8",
      plannedStart: "2026-09-15T10:00:00.000Z",
      sessions: [
        {
          id: "s2",
          startedAt: "2026-09-15T14:00:00.000Z",
          endedAt: "2026-09-15T14:30:00.000Z",
        },
        {
          id: "s1",
          startedAt: "2026-09-15T10:20:00.000Z",
          endedAt: "2026-09-15T10:40:00.000Z",
        },
      ],
    };

    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-8", instance);

    assert.strictEqual(result.executionStatus, "QUALIFIED");
    assert.strictEqual(result.metrics.actualStart, "2026-09-15T10:20:00.000Z");
    assert.strictEqual(result.metrics.startDeltaSeconds, 1200); // +20m
    assert.strictEqual(result.metrics.startDeltaMinutes, 20);
  });

  // Test 9 — duplicate session
  test("Test 9: duplicate session records are deduplicated deterministically", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-9",
      plannedStart: "2026-09-15T10:00:00.000Z",
      sessions: [
        {
          id: "s1",
          startedAt: "2026-09-15T10:15:00.000Z",
          endedAt: "2026-09-15T10:30:00.000Z",
        },
        {
          id: "s1", // Duplicate ID and times
          startedAt: "2026-09-15T10:15:00.000Z",
          endedAt: "2026-09-15T10:30:00.000Z",
        },
      ],
    };

    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-9", instance);

    assert.strictEqual(result.metrics.actualStart, "2026-09-15T10:15:00.000Z");
    assert.strictEqual(result.metrics.startDeltaSeconds, 900);
  });

  // Test 10 — input order independence
  test("Test 10: input order independence produces deep equality", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);

    const instancesOrder1: TaskScheduleInstance[] = [
      {
        taskId: "task-a",
        plannedStart: "2026-09-10T10:00:00.000Z",
        sessions: [{ id: "s1", startedAt: "2026-09-10T10:10:00.000Z" }],
      },
      {
        taskId: "task-b",
        plannedStart: "2026-09-11T10:00:00.000Z",
        sessions: [{ id: "s2", startedAt: "2026-09-11T09:50:00.000Z" }],
      },
    ];

    const instancesOrder2: TaskScheduleInstance[] = [
      {
        taskId: "task-b",
        plannedStart: "2026-09-11T10:00:00.000Z",
        sessions: [{ id: "s2", startedAt: "2026-09-11T09:50:00.000Z" }],
      },
      {
        taskId: "task-a",
        plannedStart: "2026-09-10T10:00:00.000Z",
        sessions: [{ id: "s1", startedAt: "2026-09-10T10:10:00.000Z" }],
      },
    ];

    const ctx = createPatternContext();
    const res1 = detector.evaluatePatternWithInstances(ctx, "eval-10", "pat-10", instancesOrder1);
    const res2 = detector.evaluatePatternWithInstances(ctx, "eval-10", "pat-10", instancesOrder2);

    assert.deepStrictEqual(res1.metrics, res2.metrics);
    assert.deepStrictEqual(res1.sample, res2.sample);
    assert.deepStrictEqual(res1.evidenceReferences, res2.evidenceReferences);
  });

  // Test 11 — timezone-equivalent timestamps
  test("Test 11: timezone-equivalent timestamps (+05:30 vs Z) resolve to exact zero delta", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-11",
      plannedStart: "2026-09-10T10:00:00+05:30",
      sessions: [
        {
          id: "s1",
          startedAt: "2026-09-10T04:30:00Z", // Same instant as 10:00+05:30
        },
      ],
    };

    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-11", instance);

    assert.strictEqual(result.metrics.startDeltaSeconds, 0);
    assert.strictEqual(result.metrics.classification, "ON_TIME");
  });

  // Test 12 — invalid timestamp
  test("Test 12: malformed timestamp yields INTEGRITY_ERROR, distinct from INDETERMINATE_COVERAGE", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-12",
      plannedStart: "not-a-valid-date",
      sessions: [{ id: "s1", startedAt: "2026-09-15T10:00:00.000Z" }],
    };

    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-12", instance);

    assert.strictEqual(result.executionStatus, "INDETERMINATE_COVERAGE");
    assert.strictEqual(result.metrics.startDeltaSeconds, null);
    assert.strictEqual(result.metrics.deltaRatio, null);
    assert.strictEqual(result.metrics.status, "INTEGRITY_ERROR");
    assert.ok(result.epistemicCaveats.includes("INTEGRITY_ERROR_CORRUPT_TIMESTAMPS"));
  });

  // Test 13 — pattern with early/late/on-time mixture
  test("Test 13: pattern with early/late/on-time mixture correctly computes distribution metrics", () => {
    const detector = new ScheduleVarianceDetector({
      ...defaultConfig,
      onTimeToleranceSeconds: 300, // 5m
      minimumQualifyingTaskInstances: 5,
      minimumDistinctCalendarDays: 3,
      delayedStartFractionThreshold: 0.5,
    });

    // 5 tasks on 3 distinct days:
    // Task 1: planned 10:00, actual 09:50 (-10m = -600s) -> EARLY
    // Task 2: planned 10:00, actual 10:02 (+2m = +120s) -> ON_TIME
    // Task 3: planned 10:00, actual 10:15 (+15m = +900s) -> LATE
    // Task 4: planned 10:00, actual 10:20 (+20m = +1200s) -> LATE
    // Task 5: planned 10:00, actual 10:00 (0m = 0s) -> ON_TIME
    const instances: TaskScheduleInstance[] = [
      {
        taskId: "t1",
        plannedStart: "2026-09-10T10:00:00.000Z",
        sessions: [{ id: "s1", startedAt: "2026-09-10T09:50:00.000Z" }],
      },
      {
        taskId: "t2",
        plannedStart: "2026-09-11T10:00:00.000Z",
        sessions: [{ id: "s2", startedAt: "2026-09-11T10:02:00.000Z" }],
      },
      {
        taskId: "t3",
        plannedStart: "2026-09-12T10:00:00.000Z",
        sessions: [{ id: "s3", startedAt: "2026-09-12T10:15:00.000Z" }],
      },
      {
        taskId: "t4",
        plannedStart: "2026-09-12T14:00:00.000Z",
        sessions: [{ id: "s4", startedAt: "2026-09-12T14:20:00.000Z" }],
      },
      {
        taskId: "t5",
        plannedStart: "2026-09-12T16:00:00.000Z",
        sessions: [{ id: "s5", startedAt: "2026-09-12T16:00:00.000Z" }],
      },
    ];

    const ctx = createPatternContext();
    const result = detector.evaluatePatternWithInstances(ctx, "eval-13", "pat-13", instances);

    // Distribution: [-600, 0, 120, 900, 1200]
    // Median: 120
    // IQR: 900 - 0 = 900
    // Mean: (-600 + 0 + 120 + 900 + 1200) / 5 = 324
    assert.strictEqual(result.metrics.medianStartDeltaSeconds, 120);
    assert.strictEqual(result.metrics.iqrStartDeltaSeconds, 900);
    assert.strictEqual(result.metrics.meanStartDeltaSeconds, 324);

    // Fractions:
    // early: 1/5 = 0.2
    // onTime: 2/5 = 0.4
    // late: 2/5 = 0.4
    assert.strictEqual(result.metrics.earlyTaskFraction, 0.2);
    assert.strictEqual(result.metrics.onTimeTaskFraction, 0.4);
    assert.strictEqual(result.metrics.lateTaskFraction, 0.4);

    assert.strictEqual(result.metrics.punctualStartTaskCount, 3); // 1 early + 2 on-time
    assert.strictEqual(result.metrics.delayedStartTaskCount, 2);
    assert.strictEqual(result.metrics.observedStartTaskCount, 5);

    // With delayedStartFractionThreshold = 0.5, 0.4 is below threshold -> NO_PATTERN
    assert.strictEqual(result.executionStatus, "NO_PATTERN");
  });

  // Test 14 — missing tasks excluded from denominator
  test("Test 14: tasks missing plannedStart are excluded from fraction denominator", () => {
    const detector = new ScheduleVarianceDetector({
      ...defaultConfig,
      minimumQualifyingTaskInstances: 5,
      minimumDistinctCalendarDays: 2,
    });

    // 10 total tasks:
    // 6 have plannedStart + sessions (3 punctual, 3 late)
    // 4 have plannedStart = null
    const instances: TaskScheduleInstance[] = [
      // 6 schedulable tasks (Day 1: 3 tasks, Day 2: 3 tasks)
      {
        taskId: "t1",
        plannedStart: "2026-09-10T10:00:00.000Z",
        sessions: [{ id: "s1", startedAt: "2026-09-10T10:00:00.000Z" }], // ON_TIME
      },
      {
        taskId: "t2",
        plannedStart: "2026-09-10T12:00:00.000Z",
        sessions: [{ id: "s2", startedAt: "2026-09-10T12:00:00.000Z" }], // ON_TIME
      },
      {
        taskId: "t3",
        plannedStart: "2026-09-10T14:00:00.000Z",
        sessions: [{ id: "s3", startedAt: "2026-09-10T14:00:00.000Z" }], // ON_TIME
      },
      {
        taskId: "t4",
        plannedStart: "2026-09-11T10:00:00.000Z",
        sessions: [{ id: "s4", startedAt: "2026-09-11T10:20:00.000Z" }], // LATE (+20m)
      },
      {
        taskId: "t5",
        plannedStart: "2026-09-11T12:00:00.000Z",
        sessions: [{ id: "s5", startedAt: "2026-09-11T12:20:00.000Z" }], // LATE (+20m)
      },
      {
        taskId: "t6",
        plannedStart: "2026-09-11T14:00:00.000Z",
        sessions: [{ id: "s6", startedAt: "2026-09-11T14:20:00.000Z" }], // LATE (+20m)
      },
      // 4 tasks with missing plannedStart
      { taskId: "t7", plannedStart: null, sessions: [{ id: "s7", startedAt: "2026-09-11T15:00:00.000Z" }] },
      { taskId: "t8", plannedStart: null, sessions: [{ id: "s8", startedAt: "2026-09-11T16:00:00.000Z" }] },
      { taskId: "t9", plannedStart: null, sessions: [] },
      { taskId: "t10", plannedStart: null, sessions: [] },
    ];

    const ctx = createPatternContext();
    const result = detector.evaluatePatternWithInstances(ctx, "eval-14", "pat-14", instances);

    // Denominator must be 6 (observedStartTaskCount), NOT 10!
    assert.strictEqual(result.metrics.totalTaskCount, 10);
    assert.strictEqual(result.metrics.unplannedTaskCount, 4);
    assert.strictEqual(result.metrics.observedStartTaskCount, 6);
    assert.strictEqual(result.metrics.delayedStartTaskCount, 3);
    assert.strictEqual(result.metrics.punctualStartTaskCount, 3);

    // Fractions: 3/6 = 0.5 (NOT 3/10 = 0.3)
    assert.strictEqual(result.metrics.lateTaskFraction, 0.5);
    assert.strictEqual(result.metrics.onTimeTaskFraction, 0.5);
  });

  test("Test 15: insufficient current evidence (below minimum qualifying tasks) emits INSUFFICIENT_EVIDENCE", () => {
    const detector = new ScheduleVarianceDetector({
      ...defaultConfig,
      minimumQualifyingTaskInstances: 5,
    });

    // Only 2 observed tasks
    const instances: TaskScheduleInstance[] = [
      {
        taskId: "t1",
        plannedStart: "2026-09-10T10:00:00.000Z",
        sessions: [{ id: "s1", startedAt: "2026-09-10T10:20:00.000Z" }],
      },
      {
        taskId: "t2",
        plannedStart: "2026-09-11T10:00:00.000Z",
        sessions: [{ id: "s2", startedAt: "2026-09-11T10:20:00.000Z" }],
      },
    ];

    const ctx = createPatternContext();
    const result = detector.evaluatePatternWithInstances(ctx, "eval-15", "pat-15", instances);

    assert.strictEqual(result.executionStatus, "INSUFFICIENT_EVIDENCE");
    assert.ok(result.epistemicCaveats.includes("INSUFFICIENT_QUALIFYING_SCHEDULED_TASKS"));
  });

  test("inverted session window is INTEGRITY_ERROR, distinct from NOT_OBSERVED missingness", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-reversed",
      plannedStart: "2026-09-15T10:00:00.000Z",
      sessions: [
        {
          id: "s-rev",
          startedAt: "2026-09-15T10:30:00.000Z",
          endedAt: "2026-09-15T10:00:00.000Z",
        },
      ],
    };
    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-rev", instance);
    assert.strictEqual(result.metrics.status, "INTEGRITY_ERROR");
    assert.strictEqual(result.metrics.actualStart, null);
    assert.ok(result.epistemicCaveats.includes("INTEGRITY_ERROR_CORRUPT_TIMESTAMPS"));
    assert.notStrictEqual(result.metrics.status, "NOT_OBSERVED");
  });

  test("duplicate dedupe is deterministic under input shuffling (sort before dedupe)", () => {
    const base = [
      { id: "s1", startedAt: "2026-09-15T10:15:00.000Z" },
      { id: "s1", startedAt: "2026-09-15T10:20:00.000Z" },
      { id: "s2", startedAt: "2026-09-15T10:10:00.000Z" },
    ];
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const run = (order: typeof base) =>
      detector.evaluateTaskInstance(
        createEpisodeContext(),
        "dedupe",
        { taskId: "task-dedupe", plannedStart: "2026-09-15T10:00:00.000Z", sessions: order }
      ).metrics.actualStart;
    assert.strictEqual(run(base), run([...base].reverse()));
    assert.strictEqual(run(base), run([base[2]!, base[1]!, base[0]!]));
  });

  test("uncorroborated session start defaults corroboration to false", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-corr",
      plannedStart: "2026-09-15T10:00:00.000Z",
      sessions: [{ id: "s1", startedAt: "2026-09-15T10:05:00.000Z" }],
    };
    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-corr", instance);
    assert.strictEqual(result.metrics.corroboration, false);
    assert.ok(result.epistemicCaveats.includes("ONSET_UNCORROBORATED"));
  });

  test("plannedCapturedAt passes through when supplied", () => {
    const detector = new ScheduleVarianceDetector(defaultConfig);
    const instance: TaskScheduleInstance = {
      taskId: "task-snap",
      plannedStart: "2026-09-15T10:00:00.000Z",
      plannedCapturedAt: "2026-09-14T20:00:00.000Z",
      sessions: [{ id: "s1", startedAt: "2026-09-15T10:00:00.000Z" }],
    };
    const result = detector.evaluateTaskInstance(createEpisodeContext(), "eval-snap", instance);
    assert.strictEqual(result.metrics.plannedCapturedAt, "2026-09-14T20:00:00.000Z");
  });

  test("provider clips sessions and evaluations to the pattern window without lifetime leakage", async () => {
    const { InMemoryTaskScheduleProvider, DatabaseTaskScheduleProvider } = await import("./provider");
    void DatabaseTaskScheduleProvider;
    const inWindow = {
      taskId: "in-window",
      plannedStart: "2026-09-10T10:00:00.000Z",
      sessions: [{ id: "s-in", startedAt: "2026-09-10T10:20:00.000Z", endedAt: "2026-09-10T11:00:00.000Z" }],
    };
    const outsidePlan = {
      taskId: "outside-plan",
      plannedStart: "2026-08-01T10:00:00.000Z",
      sessions: [{ id: "s-out", startedAt: "2026-09-10T10:20:00.000Z" }],
    };
    const provider = new InMemoryTaskScheduleProvider([inWindow, outsidePlan]);
    const instances = await provider.fetchTaskScheduleInstances("user", {
      start: "2026-09-01T00:00:00.000Z",
      end: "2026-09-15T00:00:00.000Z",
    });
    assert.deepStrictEqual(instances.map(i => i.taskId), ["in-window"]);
  });
});
