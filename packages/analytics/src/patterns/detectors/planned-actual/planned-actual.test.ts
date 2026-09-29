import { describe, expect, test } from "vitest";
import type { EvidenceTimeline, TemporalEvidenceBlock, WorkSession } from "@repo/types";
import { evaluatePatterns, type PatternPipelineInput } from "../../pipeline";
import { isNonCausalClaim } from "../../copy";

const WINDOW = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z" };
const BASELINE_WINDOW = { start: "2026-08-02T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" };

const DAYS = ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"];

function sessionBlock(sessionId: string, start: string, end: string): TemporalEvidenceBlock {
  return {
    id: `pa-b-${sessionId}`,
    startTime: start,
    endTime: end,
    durationSeconds: (Date.parse(end) - Date.parse(start)) / 1000,
    coverage: "OBSERVED",
    provenance: [],
    observation: {
      application: "Code",
      title: "Code window",
      cleanTitle: "Code window",
      domain: null,
      category: "general",
      isAfk: false,
      rawEventCount: 1,
    },
    report: null,
    intention: null,
    outcome: null,
  };
}

/**
 * Builds one completed task per day with a 60-minute plan. Each task has a
 * single session lasting `actualMinutes`. No plannedStart, so the
 * start-friction and schedule-variance detectors stay silent on this fixture.
 */
function buildInput(actualMinutes: number): PatternPipelineInput {
  const sessions: WorkSession[] = [];
  const blocks: TemporalEvidenceBlock[] = [];
  const tasks: PatternPipelineInput["tasks"] = [];
  for (const day of DAYS) {
    const taskId = `pa-task-${day}`;
    const sessionId = `pa-session-${day}`;
    const start = `${day}T09:00:00.000Z`;
    const end = new Date(Date.parse(start) + actualMinutes * 60_000).toISOString();
    const completedAt = new Date(Date.parse(end) + 60_000).toISOString();
    tasks.push({ id: taskId, completedAt, plannedDurationMinutes: 60 });
    sessions.push({
      id: sessionId,
      userId: "pa-user",
      taskId,
      startedAt: start,
      endedAt: end,
      durationSeconds: actualMinutes * 60,
      source: "manual" as const,
    });
    blocks.push(sessionBlock(sessionId, start, end));
  }
  const totalDurationSeconds = (Date.parse(WINDOW.end) - Date.parse(WINDOW.start)) / 1000;
  const observedSeconds = blocks.reduce((sum, block) => sum + block.durationSeconds, 0);
  const timeline: EvidenceTimeline = {
    windowStart: WINDOW.start,
    windowEnd: WINDOW.end,
    totalDurationSeconds,
    blocks: [...blocks].sort((a, b) => (a.startTime < b.startTime ? -1 : 1)),
    coverageSummary: {
      totalDurationSeconds,
      observedSeconds,
      reportedSeconds: 0,
      observedReportedSeconds: 0,
      unknownSeconds: 0,
      explainedGapSeconds: 0,
      coverageRatio: 1,
    },
  };
  const baselineTotal = (Date.parse(BASELINE_WINDOW.end) - Date.parse(BASELINE_WINDOW.start)) / 1000;
  return {
    userId: "pa-user",
    timezone: "UTC",
    boundary: "00:00",
    window: WINDOW,
    baselineWindow: BASELINE_WINDOW,
    timeline,
    baseline: {
      windowStart: BASELINE_WINDOW.start,
      windowEnd: BASELINE_WINDOW.end,
      totalDurationSeconds: baselineTotal,
      blocks: [],
      coverageSummary: {
        totalDurationSeconds: baselineTotal,
        observedSeconds: 0,
        reportedSeconds: 0,
        observedReportedSeconds: 0,
        unknownSeconds: 0,
        explainedGapSeconds: 0,
        coverageRatio: 0,
      },
    },
    sessions,
    reports: [],
    outcomes: [],
    tasks,
    connected: true,
    recordingHistory: {
      firstObservationAt: null,
      lastObservationAt: null,
      recordedDays: 0,
      connected: false,
    },
  };
}

describe("planned-vs-actual detector (Task 4)", () => {
  test("recurrent 95-minute actuals on 60-minute plans promote planned_vs_actual", () => {
    const result = evaluatePatterns(buildInput(95));
    const promoted = result.patterns.find((pattern) => pattern.detectorIdentity === "planned_vs_actual");
    expect(promoted).toBeDefined();
    expect(promoted!.role).toBe("primary");
    expect(promoted!.repertoireCategory).toBe("mismatch");
    expect(promoted!.claimLevel).toBe("recurrence");
    expect(promoted!.comparison.referenceKind).toBe("declared-intention");
    expect(isNonCausalClaim(promoted!.claim)).toBe(true);
    expect(promoted!.metrics.medianBiasRatio).toBeCloseTo(95 / 60, 10);
  });

  test("actuals matching the plan never reach the promoted list", () => {
    const result = evaluatePatterns(buildInput(60));
    expect(result.patterns.some((pattern) => pattern.detectorIdentity === "planned_vs_actual")).toBe(false);
  });
});
