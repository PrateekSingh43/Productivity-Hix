import { describe, expect, test } from "vitest";
import type { EvidenceTimeline, TemporalEvidenceBlock, WorkSession } from "@repo/types";
import { evaluatePatterns, type PatternPipelineInput } from "../../pipeline";
import { isNonCausalClaim } from "../../copy";

const WINDOW = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z" };
const BASELINE_WINDOW = { start: "2026-08-02T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" };

const DAYS = ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"];

function sessionBlock(sessionId: string, start: string, end: string): TemporalEvidenceBlock {
  return {
    id: `sf-b-${sessionId}`,
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
 * Builds one planned task per day. Each task carries an authoritative
 * plannedStart; its single session starts `lateMinutes` after the plan and
 * runs 60 minutes. No plannedDurationMinutes/completedAt, so the
 * planned-vs-actual detector stays silent on this fixture.
 */
function buildInput(lateMinutes: number): PatternPipelineInput {
  const sessions: WorkSession[] = [];
  const blocks: TemporalEvidenceBlock[] = [];
  const tasks: PatternPipelineInput["tasks"] = [];
  for (const day of DAYS) {
    const plannedStart = `${day}T09:00:00.000Z`;
    const actualStart = new Date(Date.parse(plannedStart) + lateMinutes * 60_000).toISOString();
    const actualEnd = new Date(Date.parse(actualStart) + 3_600_000).toISOString();
    const taskId = `sf-task-${day}`;
    const sessionId = `sf-session-${day}`;
    tasks.push({ id: taskId, completedAt: null, plannedStart, plannedCapturedAt: null });
    sessions.push({
      id: sessionId,
      userId: "sf-user",
      taskId,
      startedAt: actualStart,
      endedAt: actualEnd,
      durationSeconds: 3600,
      source: "manual" as const,
    });
    blocks.push(sessionBlock(sessionId, actualStart, actualEnd));
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
    userId: "sf-user",
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

describe("start-friction detector (Task 4)", () => {
  test("recurrent 45-minute start delays promote start_friction as primary friction", () => {
    const result = evaluatePatterns(buildInput(45));
    const promoted = result.patterns.find((pattern) => pattern.detectorIdentity === "start_friction");
    expect(promoted).toBeDefined();
    expect(promoted!.role).toBe("primary");
    expect(promoted!.repertoireCategory).toBe("friction");
    expect(promoted!.claimLevel).toBe("recurrence");
    expect(promoted!.comparison.referenceKind).toBe("declared-intention");
    expect(promoted!.qualification.context.kind).toBe("commitment");
    expect(isNonCausalClaim(promoted!.claim)).toBe(true);
    expect(promoted!.metrics.medianLatencySeconds).toBe(45 * 60);
  });

  test("on-time starts never reach the promoted list", () => {
    const result = evaluatePatterns(buildInput(0));
    expect(result.patterns.some((pattern) => pattern.detectorIdentity === "start_friction")).toBe(false);
  });
});
