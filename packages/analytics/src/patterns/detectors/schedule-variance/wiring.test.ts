import { describe, expect, test } from "vitest";
import { evaluatePatterns, type PatternPipelineInput } from "../../pipeline";
import { collectScheduleInstances } from "./provider";

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
  { taskId: "sv-t1", planned: "2026-09-02T10:00:00.000Z", actual: "2026-09-02T10:20:00.000Z", sessionId: "sv-s1" },
  { taskId: "sv-t2", planned: "2026-09-03T10:00:00.000Z", actual: "2026-09-03T10:25:00.000Z", sessionId: "sv-s2" },
  { taskId: "sv-t3", planned: "2026-09-04T10:00:00.000Z", actual: "2026-09-04T10:30:00.000Z", sessionId: "sv-s3" },
  { taskId: "sv-t4", planned: "2026-09-05T10:00:00.000Z", actual: "2026-09-05T10:15:00.000Z", sessionId: "sv-s4" },
  { taskId: "sv-t5", planned: "2026-09-06T10:00:00.000Z", actual: "2026-09-06T10:45:00.000Z", sessionId: "sv-s5" },
];

function buildInput(extraTaskIds: string[] = []): PatternPipelineInput {
  return {
    userId: "wiring-user",
    timezone: "UTC",
    boundary: "00:00",
    window: WINDOW,
    baselineWindow: BASELINE_WINDOW,
    timeline: emptyTimeline(WINDOW),
    baseline: emptyTimeline(BASELINE_WINDOW),
    sessions: [
      ...LATE.map((row) => ({
        id: row.sessionId,
        userId: "wiring-user",
        taskId: row.taskId,
        startedAt: row.actual,
        endedAt: new Date(Date.parse(row.actual) + 30 * 60 * 1000).toISOString(),
        durationSeconds: 1800,
        source: "manual" as const,
      })),
      // Unplanned tasks get real in-window execution so they surface as
      // NO_PLANNED_START evidence instead of empty noise.
      ...extraTaskIds.map((id, index) => ({
        id: `sv-unplanned-session-${index}`,
        userId: "wiring-user",
        taskId: id,
        startedAt: "2026-09-07T10:00:00.000Z",
        endedAt: "2026-09-07T10:30:00.000Z",
        durationSeconds: 1800,
        source: "manual" as const,
      })),
    ],
    reports: [],
    outcomes: [],
    tasks: [
      ...LATE.map((row) => ({ id: row.taskId, completedAt: null as string | null, plannedStart: row.planned })),
      ...extraTaskIds.map((id) => ({ id, completedAt: null as string | null, plannedStart: null as string | null })),
    ],
    connected: true,
    recordingHistory: {
      firstObservationAt: null,
      lastObservationAt: null,
      recordedDays: 0,
      connected: false,
    },
  };
}

function scheduleDiagnostic(input: PatternPipelineInput) {
  const result = evaluatePatterns(input);
  const diagnostic = result.diagnostics.perDetector.find((d) => d.identity === "schedule_variance");
  expect(diagnostic).toBeDefined();
  return diagnostic!;
}

describe("schedule-variance pipeline wiring (Task 1)", () => {
  test("D4 availability is AVAILABLE with 5 late authoritative instances", () => {
    const diagnostic = scheduleDiagnostic(buildInput());
    expect(diagnostic.availability).toBe("AVAILABLE");
    expect(diagnostic.eligibleOccasions).toBe(5);
  });

  test("collectScheduleInstances threads authoritative plannedStart from tasks + sessions", () => {
    const input = buildInput();
    const instances = collectScheduleInstances(input.tasks, input.sessions, input.window);
    expect(instances).toHaveLength(5);
    for (const row of LATE) {
      const instance = instances.find((i) => i.taskId === row.taskId);
      expect(instance).toBeDefined();
      // Authoritative: plannedStart comes verbatim from the task record, never inferred.
      expect(instance!.plannedStart).toBe(row.planned);
      expect(instance!.sessions.map((s) => s.id)).toEqual([row.sessionId]);
      expect(instance!.sessions[0]!.startedAt).toBe(row.actual);
    }
  });

  test("null plannedStart passes through and never blocks authoritative instances", () => {
    const input = buildInput(["sv-unplanned"]);
    const instances = collectScheduleInstances(input.tasks, input.sessions, input.window);
    const unplanned = instances.find((i) => i.taskId === "sv-unplanned");
    expect(unplanned).toBeDefined();
    // Null stays null: the episode contract reports NO_PLANNED_START downstream.
    expect(unplanned!.plannedStart).toBeNull();
    expect(scheduleDiagnostic(input).availability).toBe("AVAILABLE");
  });

  test("D4 stays NOT_AVAILABLE when no instance carries an authoritative plannedStart", () => {
    const diagnostic = scheduleDiagnostic(buildInput(["sv-unplanned"]));
    // buildInput always carries the 5 authoritative LATE tasks, so strip them here:
    // a null-only population cannot evaluate schedule fidelity.
    const nullOnly = buildInput().tasks.map((t) => ({ ...t, plannedStart: null as string | null }));
    const result = evaluatePatterns({ ...buildInput(), tasks: nullOnly });
    const nullDiagnostic = result.diagnostics.perDetector.find((d) => d.identity === "schedule_variance");
    expect(diagnostic.availability).toBe("AVAILABLE");
    expect(nullDiagnostic!.availability).toBe("NOT_AVAILABLE");
  });
});
