import { describe, expect, test } from "vitest";
import { evaluatePatterns, type PatternPipelineInput } from "../../pipeline";

const WINDOW = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z" };
const BASELINE_WINDOW = { start: "2026-08-02T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" };

function emptyTimeline(window: { start: string; end: string }) {
  const totalDurationSeconds = (Date.parse(window.end) - Date.parse(window.start)) / 1000;
  return {
    windowStart: window.start,
    windowEnd: window.end,
    totalDurationSeconds,
    blocks: [],
    coverageSummary: {
      totalDurationSeconds,
      observedSeconds: 0,
      reportedSeconds: 0,
      observedReportedSeconds: 0,
      unknownSeconds: 0,
      explainedGapSeconds: 0,
      coverageRatio: 1,
    },
  };
}

/** Five late starts on five distinct days (tolerance is 0, so any +delta is LATE). */
const LATE = [
  { taskId: "svp-t1", planned: "2026-09-02T10:00:00.000Z", actual: "2026-09-02T10:20:00.000Z", sessionId: "svp-s1" },
  { taskId: "svp-t2", planned: "2026-09-03T10:00:00.000Z", actual: "2026-09-03T10:25:00.000Z", sessionId: "svp-s2" },
  { taskId: "svp-t3", planned: "2026-09-04T10:00:00.000Z", actual: "2026-09-04T10:30:00.000Z", sessionId: "svp-s3" },
  { taskId: "svp-t4", planned: "2026-09-05T10:00:00.000Z", actual: "2026-09-05T10:15:00.000Z", sessionId: "svp-s4" },
  { taskId: "svp-t5", planned: "2026-09-06T10:00:00.000Z", actual: "2026-09-06T10:45:00.000Z", sessionId: "svp-s5" },
];

function buildInput(): PatternPipelineInput {
  return {
    userId: "promo-user",
    timezone: "UTC",
    boundary: "00:00",
    window: WINDOW,
    baselineWindow: BASELINE_WINDOW,
    timeline: emptyTimeline(WINDOW),
    baseline: emptyTimeline(BASELINE_WINDOW),
    sessions: LATE.map((row) => ({
      id: row.sessionId,
      userId: "promo-user",
      taskId: row.taskId,
      startedAt: row.actual,
      endedAt: new Date(Date.parse(row.actual) + 30 * 60 * 1000).toISOString(),
      durationSeconds: 1800,
      source: "manual" as const,
    })),
    reports: [],
    outcomes: [],
    tasks: LATE.map((row) => ({ id: row.taskId, completedAt: null as string | null, plannedStart: row.planned })),
    connected: true,
    recordingHistory: {
      firstObservationAt: null,
      lastObservationAt: null,
      recordedDays: 0,
      connected: false,
    },
  };
}

describe("schedule-variance promotion (D4)", () => {
  test("DETECTED late-start recurrence promotes a primary schedule_variance pattern", () => {
    const result = evaluatePatterns(buildInput());
    const found = result.patterns.find((p) => p.detectorIdentity === "schedule_variance");
    expect(found).toBeDefined();
    expect(found?.claimLevel).toBe("recurrence");
    expect(found?.repertoireCategory).toBe("mismatch");
  });

  test("on-time starts do not promote schedule_variance", () => {
    const input = buildInput();
    input.tasks = LATE.map((row) => ({ id: row.taskId, completedAt: null as string | null, plannedStart: row.actual }));
    input.sessions = LATE.map((row) => ({
      id: row.sessionId,
      userId: "promo-user",
      taskId: row.taskId,
      startedAt: row.actual,
      endedAt: new Date(Date.parse(row.actual) + 30 * 60 * 1000).toISOString(),
      durationSeconds: 1800,
      source: "manual" as const,
    }));
    const result = evaluatePatterns(input);
    expect(result.patterns.find((p) => p.detectorIdentity === "schedule_variance")).toBeUndefined();
  });
});
