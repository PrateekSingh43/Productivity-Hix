import { describe, expect, test } from "vitest";
import type { EvidenceTimeline, TemporalEvidenceBlock, WorkSession } from "@repo/types";
import { evaluatePatterns, type PatternPipelineInput } from "../../pipeline";
import { isNonCausalClaim } from "../../copy";

const WINDOW = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z" };
const BASELINE_WINDOW = { start: "2026-08-02T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" };

const DAYS = ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07"];

function observedBlock(
  id: string,
  start: string,
  end: string,
  observation: TemporalEvidenceBlock["observation"],
): TemporalEvidenceBlock {
  return {
    id,
    startTime: start,
    endTime: end,
    durationSeconds: (Date.parse(end) - Date.parse(start)) / 1000,
    coverage: "OBSERVED",
    provenance: [],
    observation,
    report: null,
    intention: null,
    outcome: null,
  };
}

function codeBlock(id: string, start: string, end: string): TemporalEvidenceBlock {
  return observedBlock(id, start, end, {
    application: "Code",
    title: "Code window",
    cleanTitle: "Code window",
    domain: null,
    category: "general",
    isAfk: false,
    rawEventCount: 1,
  });
}

function escapeBlock(id: string, start: string, end: string): TemporalEvidenceBlock {
  return observedBlock(id, start, end, {
    application: "Chrome",
    title: "YouTube window",
    cleanTitle: "YouTube window",
    domain: "youtube.com",
    category: "browser",
    isAfk: false,
    rawEventCount: 1,
  });
}

/**
 * Builds one task-linked session per day. Each session opens with 5 minutes
 * of recorded work, stalls for a 12-minute unobserved gap (friction trigger:
 * gap > 10m within 30m of the task start), then either resumes on an
 * escape-context domain (`withEscape`) or on the original work context.
 * Tasks carry no plannedStart/plannedDurationMinutes/completedAt so the
 * start-friction and planned-vs-actual detectors stay silent.
 */
function buildInput(withEscape: boolean): PatternPipelineInput {
  const sessions: WorkSession[] = [];
  const blocks: TemporalEvidenceBlock[] = [];
  const tasks: PatternPipelineInput["tasks"] = [];
  for (const day of DAYS) {
    const taskId = `eh-task-${day}`;
    const sessionId = `eh-session-${day}`;
    const startMs = Date.parse(`${day}T09:00:00.000Z`);
    const iso = (offsetMs: number) => new Date(startMs + offsetMs).toISOString();
    const sessionStart = iso(0);
    const sessionEnd = iso(3_600_000);
    tasks.push({ id: taskId, completedAt: null });
    sessions.push({
      id: sessionId,
      userId: "eh-user",
      taskId,
      startedAt: sessionStart,
      endedAt: sessionEnd,
      durationSeconds: 3600,
      source: "manual" as const,
    });
    blocks.push(codeBlock(`eh-b1-${day}`, iso(0), iso(300_000)));
    // 12-minute gap: [start+5m, start+17m].
    const resumeStart = iso(1_020_000);
    const resumeEnd = iso(1_320_000);
    blocks.push(
      withEscape
        ? escapeBlock(`eh-b2-${day}`, resumeStart, resumeEnd)
        : codeBlock(`eh-b2-${day}`, resumeStart, resumeEnd),
    );
    blocks.push(codeBlock(`eh-b3-${day}`, resumeEnd, sessionEnd));
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
    userId: "eh-user",
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

describe("escape-hatch detector (Task 4)", () => {
  test("friction followed by escape-context activity promotes escape_hatch as co-occurrence", () => {
    const result = evaluatePatterns(buildInput(true));
    const promoted = result.patterns.find((pattern) => pattern.detectorIdentity === "escape_hatch");
    expect(promoted).toBeDefined();
    expect(promoted!.role).toBe("primary");
    expect(promoted!.claimLevel).toBe("co-occurrence");
    expect(promoted!.comparison.referenceKind).toBe("declared-intention");
    expect(isNonCausalClaim(promoted!.claim)).toBe(true);
    expect(promoted!.metrics.escapeShare).toBe(1);
  });

  test("friction without escape-context activity never reaches the promoted list", () => {
    const result = evaluatePatterns(buildInput(false));
    expect(result.patterns.some((pattern) => pattern.detectorIdentity === "escape_hatch")).toBe(false);
  });
});
