import { describe, expect, test } from "vitest";
import type { CheckIn, EvidenceTimeline, TemporalEvidenceBlock, WorkSession } from "@repo/types";
import { evaluatePatterns, type PatternPipelineInput } from "../../pipeline";

const WINDOW = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z" };
const BASELINE_WINDOW = { start: "2026-08-02T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" };

const CURRENT_DAYS = ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"];
const BASELINE_DAYS = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15"];

function appBlock(app: string, start: string, end: string, index: number): TemporalEvidenceBlock {
  return {
    id: `gh-b-${start}-${index}`,
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
 * Tiles [start, end] with `segments` equal alternating-app blocks, so the
 * window measures `segments - 1` switches over its span. No AFK/break/unknown
 * intervals, so the full span counts as qualifying observed activity.
 */
function windowBlocks(start: string, end: string, segments: number): TemporalEvidenceBlock[] {
  const startMs = Date.parse(start);
  const segmentMs = (Date.parse(end) - startMs) / segments;
  return Array.from({ length: segments }, (_, index) => {
    const app = index % 2 === 0 ? "Code" : "Chrome";
    const blockStart = new Date(startMs + index * segmentMs).toISOString();
    const blockEnd = new Date(startMs + (index + 1) * segmentMs).toISOString();
    return appBlock(app, blockStart, blockEnd, index);
  });
}

function checkIn(id: string, userId: string, windowStart: string, windowEnd: string, focus: string): CheckIn {
  return {
    id,
    userId,
    workSessionId: null,
    taskId: null,
    windowStart,
    windowEnd,
    activityAssessment: null,
    alignment: null,
    reasons: [],
    state: null,
    energy: null,
    focus,
    note: null,
    questionVersion: "v1",
    source: "synthetic",
    intent: null,
    progress: null,
    blocker: null,
    productive: null,
    outcome: null,
    createdAt: windowEnd,
  };
}

/**
 * Builds one AM session (09:30-11:30, 2h) and one PM session (15:00-18:00, 3h)
 * per day. `amSegments - 1` switches over 2h set the AM rate; `pmSegments - 1`
 * switches over 3h set the PM rate. Calm AM (3 segments -> 1.0/hr) vs busy PM
 * (9 segments -> ~2.67/hr) mirrors the brief's synthetic contrast.
 */
function buildDays(days: string[], prefix: string, amSegments: number, pmSegments: number) {
  const sessions: WorkSession[] = [];
  const blocks: TemporalEvidenceBlock[] = [];
  const reports: CheckIn[] = [];
  for (const day of days) {
    const amStart = `${day}T09:30:00.000Z`;
    const amEnd = `${day}T11:30:00.000Z`;
    const pmStart = `${day}T15:00:00.000Z`;
    const pmEnd = `${day}T18:00:00.000Z`;
    sessions.push(
      {
        id: `${prefix}-am-${day}`,
        userId: "gh-user",
        taskId: "gh-task",
        startedAt: amStart,
        endedAt: amEnd,
        durationSeconds: 7200,
        source: "manual" as const,
      },
      {
        id: `${prefix}-pm-${day}`,
        userId: "gh-user",
        taskId: "gh-task",
        startedAt: pmStart,
        endedAt: pmEnd,
        durationSeconds: 10800,
        source: "manual" as const,
      },
    );
    blocks.push(...windowBlocks(amStart, amEnd, amSegments), ...windowBlocks(pmStart, pmEnd, pmSegments));
    reports.push(
      checkIn(`${prefix}-ci-am-${day}`, "gh-user", amStart, amEnd, "focused"),
      checkIn(`${prefix}-ci-pm-${day}`, "gh-user", pmStart, pmEnd, "scattered"),
    );
  }
  return { sessions, blocks, reports };
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

/** Calm AM (~1.0/hr, focused) vs busy PM (~2.67/hr, scattered), current + baseline. */
function buildInput(amSegments: number, pmSegments: number): PatternPipelineInput {
  const current = buildDays(CURRENT_DAYS, "gh-current", amSegments, pmSegments);
  const baseline = buildDays(BASELINE_DAYS, "gh-baseline", amSegments, pmSegments);
  return {
    userId: "gh-user",
    timezone: "UTC",
    boundary: "00:00",
    window: WINDOW,
    baselineWindow: BASELINE_WINDOW,
    timeline: timelineFor(WINDOW, current.blocks),
    baseline: timelineFor(BASELINE_WINDOW, baseline.blocks),
    sessions: [...current.sessions, ...baseline.sessions],
    reports: [...current.reports, ...baseline.reports],
    outcomes: [],
    tasks: [{ id: "gh-task", completedAt: null }],
    connected: true,
    recordingHistory: {
      firstObservationAt: null,
      lastObservationAt: null,
      recordedDays: 0,
      connected: false,
    },
  };
}

describe("golden-hours focus detector (Task 3)", () => {
  test("calm focused mornings vs busy scattered afternoons promote golden_hours_focus as primary mismatch", () => {
    const result = evaluatePatterns(buildInput(3, 9));
    const promoted = result.patterns.find((pattern) => pattern.detectorIdentity === "golden_hours_focus");
    expect(promoted).toBeDefined();
    expect(promoted!.role).toBe("primary");
    expect(promoted!.repertoireCategory).toBe("mismatch");
    expect(promoted!.claimLevel).toBe("co-occurrence");
    expect(promoted!.comparison.referenceKind).toBe("own-history");
    expect(promoted!.qualification.context.kind).toBe("time-window");
    expect(promoted!.qualification.context.key).toBe("09:30-11:30 vs 15:00-18:00");
  });

  test("at-parity mornings and afternoons never reach the promoted list", () => {
    const result = evaluatePatterns(buildInput(3, 5));
    expect(result.patterns.some((pattern) => pattern.detectorIdentity === "golden_hours_focus")).toBe(false);
  });
});
