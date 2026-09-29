import { describe, expect, test } from "vitest";
import type { EvidenceTimeline, TemporalEvidenceBlock, WorkSession } from "@repo/types";
import { evaluatePatterns, type PatternPipelineInput } from "./pipeline";

const WINDOW = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z" };
const BASELINE_WINDOW = { start: "2026-08-02T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" };

/** Two days of data: below every detector's day minima, so no pattern can promote. */
const CURRENT_DAYS = ["2026-09-02", "2026-09-03"];

function appBlock(app: string, start: string, end: string, index: number): TemporalEvidenceBlock {
  return {
    id: `es-b-${start}-${index}`,
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
    ["10:00:00.000", "14:00:00.000"].map((hour, hourIndex) => {
      const startedAt = `${day}T${hour}Z`;
      return {
        id: `${prefix}-s${dayIndex}-${hourIndex}`,
        userId: "es-user",
        taskId: "es-task",
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

/** 4 current sessions across 2 days (sub-threshold: below the 5-session / 3-day gates). */
function buildInput(): PatternPipelineInput {
  const currentSessions = sessionsFor(CURRENT_DAYS, "es-current");
  const currentBlocks = currentSessions.flatMap((session) => hourlyBlocks(session.startedAt, 8));
  return {
    userId: "es-user",
    timezone: "UTC",
    boundary: "00:00",
    window: WINDOW,
    baselineWindow: BASELINE_WINDOW,
    timeline: timelineFor(WINDOW, currentBlocks),
    baseline: timelineFor(BASELINE_WINDOW, []),
    sessions: currentSessions,
    reports: [],
    outcomes: [],
    tasks: [{ id: "es-task", completedAt: null }],
    connected: true,
    recordingHistory: {
      firstObservationAt: null,
      lastObservationAt: null,
      recordedDays: 0,
      connected: false,
    },
  };
}

describe("honest early-signals tier (days 1-6)", () => {
  test("two days of data stays insufficient-evidence but emits a low-confidence early signal", () => {
    const result = evaluatePatterns(buildInput());
    expect(result.state).toBe("insufficient-evidence");
    expect(result.patterns).toHaveLength(0);
    expect(result.earlySignals.length).toBeGreaterThan(0);
    const first = result.earlySignals[0]!;
    expect(first.confidence).toBe("low");
    expect(first.headline.trim().length).toBeGreaterThan(0);
    expect(first.needsMoreDays).toBeGreaterThanOrEqual(1);
    expect(first.claimLevel).toBe("co-occurrence");
  });

  test("early signals never enter the promoted pattern list", () => {
    const result = evaluatePatterns(buildInput());
    expect(result.patterns).toHaveLength(0);
    for (const signal of result.earlySignals) {
      expect(signal.confidence).toBe("low");
      expect(signal.sessions).toBeGreaterThanOrEqual(2);
    }
  });

  test("a single occasion is not enough for an early signal", () => {
    const input = buildInput();
    const oneSession = input.sessions.slice(0, 1);
    const oneBlocks = oneSession.flatMap((session) => hourlyBlocks(session.startedAt, 8));
    const result = evaluatePatterns({ ...input, sessions: oneSession, timeline: timelineFor(WINDOW, oneBlocks) });
    expect(result.earlySignals).toHaveLength(0);
  });
});
