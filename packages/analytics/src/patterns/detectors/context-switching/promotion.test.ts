import { describe, expect, test } from "vitest";
import type { EvidenceTimeline, TemporalEvidenceBlock, WorkSession } from "@repo/types";
import { evaluatePatterns, type PatternPipelineInput } from "../../pipeline";

const WINDOW = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z" };
const BASELINE_WINDOW = { start: "2026-08-02T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" };

const CURRENT_DAYS = ["2026-09-02", "2026-09-03", "2026-09-04"];
const BASELINE_DAYS = ["2026-08-10", "2026-08-11", "2026-08-12"];
const SESSION_HOURS = ["10:00:00.000", "14:00:00.000"];

function appBlock(app: string, start: string, end: string, index: number): TemporalEvidenceBlock {
  return {
    id: `cs-b-${start}-${index}`,
    startTime: start,
    endTime: end,
    durationSeconds: (Date.parse(end) - Date.parse(start)) / 1000,
    coverage: "OBSERVED",
    provenance: [],
    observation: {
      application: app,
      title: `${app} window`,
      cleanTitle: `${app} window`,
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
 * Tiles one hour with `segments` equal alternating-app blocks, so the episode
 * measures `segments - 1` switches per hour. AFK/break/unknown intervals are
 * absent, so the full hour counts as qualifying observed activity.
 */
function hourlyBlocks(sessionStart: string, segments: number): TemporalEvidenceBlock[] {
  const startMs = Date.parse(sessionStart);
  const segmentMs = 3_600_000 / segments;
  return Array.from({ length: segments }, (_, index) => {
    const app = index % 2 === 0 ? "Code" : "Chrome";
    const blockStart = new Date(startMs + index * segmentMs).toISOString();
    const blockEnd = new Date(startMs + (index + 1) * segmentMs).toISOString();
    return appBlock(app, blockStart, blockEnd, index);
  });
}

function sessionsFor(days: string[], prefix: string): WorkSession[] {
  return days.flatMap((day, dayIndex) =>
    SESSION_HOURS.map((hour, hourIndex) => {
      const startedAt = `${day}T${hour}Z`;
      return {
        id: `${prefix}-s${dayIndex}-${hourIndex}`,
        userId: "cs-user",
        taskId: "cs-task",
        startedAt,
        endedAt: new Date(Date.parse(startedAt) + 3_600_000).toISOString(),
        durationSeconds: 3600,
        source: "manual" as const,
      };
    }),
  );
}

function timelineFor(window: { start: string; end: string }, blocks: TemporalEvidenceBlock[]): EvidenceTimeline {
  const totalDurationSeconds = (Date.parse(window.end) - Date.parse(window.start)) / 1000;
  const observedSeconds = blocks.reduce((sum, block) => sum + block.durationSeconds, 0);
  return {
    windowStart: window.start,
    windowEnd: window.end,
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
}

/** 6 current sessions (~7/hr) + 6 baseline sessions (`baselineSegments - 1`/hr). */
function buildInput(baselineSegments: number): PatternPipelineInput {
  const currentSessions = sessionsFor(CURRENT_DAYS, "cs-current");
  const baselineSessions = sessionsFor(BASELINE_DAYS, "cs-baseline");
  const currentBlocks = currentSessions.flatMap((session) => hourlyBlocks(session.startedAt, 8));
  const baselineBlocks = baselineSessions.flatMap((session) => hourlyBlocks(session.startedAt, baselineSegments));
  return {
    userId: "cs-user",
    timezone: "UTC",
    boundary: "00:00",
    window: WINDOW,
    baselineWindow: BASELINE_WINDOW,
    timeline: timelineFor(WINDOW, currentBlocks),
    baseline: timelineFor(BASELINE_WINDOW, baselineBlocks),
    sessions: [...currentSessions, ...baselineSessions],
    reports: [],
    outcomes: [],
    tasks: [{ id: "cs-task", completedAt: null }],
    connected: true,
    recordingHistory: {
      firstObservationAt: null,
      lastObservationAt: null,
      recordedDays: 0,
      connected: false,
    },
  };
}

describe("context-switching primary promotion (Task 2)", () => {
  test("elevated switching (~7/hr vs ~2/hr) promotes context_switching_density as primary co-occurrence", () => {
    const result = evaluatePatterns(buildInput(3));
    const promoted = result.patterns.find((pattern) => pattern.detectorIdentity === "context_switching_density");
    expect(promoted).toBeDefined();
    expect(promoted!.claimLevel).toBe("co-occurrence");
    expect(promoted!.role).toBe("primary");
  });

  test("at-baseline switching stays contributor-only and never reaches the promoted list", () => {
    const result = evaluatePatterns(buildInput(8));
    expect(result.patterns.some((pattern) => pattern.detectorIdentity === "context_switching_density")).toBe(false);
  });
});
