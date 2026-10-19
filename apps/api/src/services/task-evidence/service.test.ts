import { afterEach, describe, expect, it } from "vitest";
import { resetTestDb, setTestDb } from "../../lib/prisma";
import { getTaskEvidence } from "./service";

afterEach(resetTestDb);

/**
 * Phase 1 Slice C: task evidence read model (R3 freshness, R7 provenance).
 *
 * The endpoint loads committed rows (telemetry, sessions, contexts,
 * corrections, check-ins, gap explanations), runs the PURE builder, and
 * returns evidence + freshness metadata computed per request. This test pins
 * the load -> build -> freshness contract with representative rows.
 */

const FROM = new Date("2026-10-18T09:00:00.000Z");
const TO = new Date("2026-10-18T11:00:00.000Z");

function taskRow() {
  return {
    id: "task-1",
    userId: "user-1",
    title: "Trace the useQuery lifecycle",
    description: null,
    status: "in_progress",
    priority: "medium",
    plannedDurationMinutes: 60,
    plannedStart: null,
    dueAt: null,
    completedAt: null,
    goalId: "goal-1",
    productiveDate: null,
    createdAt: new Date("2026-10-17T08:00:00.000Z"),
    updatedAt: new Date("2026-10-18T08:00:00.000Z"),
    goal: {
      id: "goal-1",
      planId: "plan-1",
      userId: "user-1",
      title: "Learn TanStack Query",
      order: 0,
      outcome: null,
      createdAt: new Date("2026-10-17T08:00:00.000Z"),
      updatedAt: new Date("2026-10-17T08:00:00.000Z"),
    },
  };
}

function eventRow(timestamp: Date, durationSeconds: number, application: string) {
  return {
    id: `evt-${timestamp.getTime()}`,
    externalId: `ext-${timestamp.getTime()}`,
    timestamp,
    source: "desktop",
    watcher: "window",
    duration: durationSeconds,
    data: { application, title: `${application} window` },
  };
}

function sessionRow(startedAt: Date, endedAt: Date | null, taskId: string | null = "task-1") {
  return {
    id: "session-1",
    userId: "user-1",
    taskId,
    startedAt,
    endedAt,
    durationSeconds: Math.round(((endedAt ?? TO).getTime() - startedAt.getTime()) / 1000),
    targetDurationMinutes: null,
    isPaused: false,
    pausedAt: null,
    lastResumedAt: startedAt,
    source: "manual",
    notes: null,
  };
}

function contextRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ctx-1",
    userId: "user-1",
    taskId: "task-1",
    goalId: null,
    startedAt: FROM,
    endedAt: null,
    startedBySessionId: null,
    endedReason: null,
    createdAt: FROM,
    ...overrides,
  };
}

function correctionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "corr-1",
    userId: "user-1",
    windowStart: FROM,
    windowEnd: new Date("2026-10-18T10:00:00.000Z"),
    targetKind: "NONE",
    taskId: null,
    taskTitleSnapshot: null,
    reason: null,
    supersedesCorrectionId: null,
    createdAt: new Date("2026-10-18T08:00:00.000Z"),
    ...overrides,
  };
}

function evidenceDb(overrides: {
  task?: unknown;
  sessions?: unknown[];
  events?: unknown[];
  contexts?: unknown[];
  corrections?: unknown[];
  checkIns?: unknown[];
  gapExplanations?: unknown[];
}) {
  return {
    task: { findFirst: async () => (overrides.task === undefined ? taskRow() : overrides.task) },
    workSession: { findMany: async () => overrides.sessions ?? [] },
    normalizedActivity: { findMany: async () => overrides.events ?? [] },
    workContext: { findMany: async () => overrides.contexts ?? [] },
    attributionCorrection: { findMany: async () => overrides.corrections ?? [] },
    checkIn: { findMany: async () => overrides.checkIns ?? [] },
    userGapExplanation: { findMany: async () => overrides.gapExplanations ?? [] },
  };
}

describe("getTaskEvidence (Slice C)", () => {
  it("rejects an unknown or foreign task with 404", async () => {
    setTestDb(evidenceDb({ task: null }));
    const err = await getTaskEvidence("user-1", "task-x", { from: FROM, to: TO }).catch((e) => e);
    expect(err?.statusCode).toBe(404);
  });

  it("builds telemetry coverage and reports freshness with input counts", async () => {
    setTestDb(
      evidenceDb({
        events: [eventRow(FROM, 60 * 60, "VS Code")],
        sessions: [sessionRow(FROM, new Date("2026-10-18T10:00:00.000Z"))],
        contexts: [contextRow()],
      }),
    );
    const result = await getTaskEvidence("user-1", "task-1", { from: FROM, to: TO });

    expect(result.taskId).toBe("task-1");
    expect(result.taskTitle).toBe("Trace the useQuery lifecycle");
    expect(result.freshness.windowStart).toBe(FROM.toISOString());
    expect(result.freshness.windowEnd).toBe(TO.toISOString());
    expect(result.freshness.computedAt).toBeTruthy();
    expect(result.freshness.telemetryThrough).toBe("2026-10-18T10:00:00.000Z");
    expect(result.freshness.inputs).toEqual({
      activityEvents: 1,
      sessions: 1,
      workContexts: 1,
      corrections: 0,
      checkIns: 0,
      gapExplanations: 0,
    });

    const observed = result.evidence.blocks.filter((b) => b.coverage === "OBSERVED");
    expect(observed.length).toBeGreaterThan(0);
    // The open context attributes the observed block to the task (R7).
    expect(observed[0]?.intention?.taskId).toBe("task-1");
    const provenance = observed[0]?.provenance.find((p) => p.role !== undefined);
    expect(provenance?.role).toBe("SELECTED");
  });

  it("applies a NONE correction as EXPLICIT UNLINKED without hiding the observation", async () => {
    setTestDb(
      evidenceDb({
        events: [eventRow(FROM, 60 * 60, "VS Code")],
        contexts: [contextRow()],
        corrections: [correctionRow()],
      }),
    );
    const result = await getTaskEvidence("user-1", "task-1", { from: FROM, to: TO });

    const block = result.evidence.blocks.find((b) => b.coverage === "OBSERVED");
    expect(block?.intention).toMatchObject({
      targetScope: "UNLINKED",
      taskId: null,
      linkType: "EXPLICIT",
    });
    // The losing context is still visible as conflicting provenance.
    const contextSignal = block?.provenance.find((p) => p.source === "work_context");
    expect(contextSignal?.role).toBe("CONFLICTING");
  });

  it("falls back to the session task when no context or correction exists", async () => {
    setTestDb(
      evidenceDb({
        events: [eventRow(FROM, 60 * 60, "VS Code")],
        sessions: [sessionRow(FROM, new Date("2026-10-18T10:00:00.000Z"))],
      }),
    );
    const result = await getTaskEvidence("user-1", "task-1", { from: FROM, to: TO });
    const block = result.evidence.blocks.find((b) => b.coverage === "OBSERVED");
    expect(block?.intention?.taskId).toBe("task-1");
    expect(block?.intention?.linkType).toBe("EXPLICIT");
  });

  it("reports telemetryThrough null and UNKNOWN coverage when no telemetry exists", async () => {
    setTestDb(evidenceDb({ contexts: [contextRow()] }));
    const result = await getTaskEvidence("user-1", "task-1", { from: FROM, to: TO });
    expect(result.freshness.telemetryThrough).toBeNull();
    expect(result.evidence.blocks.every((b) => b.coverage === "UNKNOWN")).toBe(true);
  });
});
