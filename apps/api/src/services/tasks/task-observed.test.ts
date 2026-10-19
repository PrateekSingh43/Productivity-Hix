import { afterEach, describe, expect, it } from "vitest";
import { resetTestDb, setTestDb } from "../../lib/prisma";
import { getTaskObservedActivity } from "./service";

afterEach(resetTestDb);

/**
 * Acceptance-review pin for the /api/tasks/:id/activity read path (Slice C):
 * observed clusters must be EVIDENCE-attributed to the requested task.
 *
 * - corrected-away time never leaks in,
 * - AFK telemetry never counts,
 * - observed-but-unlinked telemetry never counts,
 * - a check-in report over a telemetry gap is never treated as observed proof.
 */

const START = new Date("2026-10-18T09:00:00.000Z");
const END = new Date("2026-10-18T10:00:00.000Z");

function taskRow(sessions: unknown[]) {
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
    goalId: null,
    productiveDate: null,
    createdAt: new Date("2026-10-17T08:00:00.000Z"),
    updatedAt: new Date("2026-10-18T08:00:00.000Z"),
    sessions,
  };
}

function sessionRow(taskId: string | null) {
  return {
    id: "session-1",
    userId: "user-1",
    taskId,
    startedAt: START,
    endedAt: END,
    durationSeconds: 3600,
    targetDurationMinutes: null,
    isPaused: false,
    pausedAt: null,
    lastResumedAt: START,
    source: "manual",
    notes: null,
  };
}

function eventRow(
  timestamp: string,
  durationMs: number,
  application: string,
  watcher = "window",
) {
  return {
    id: `evt-${timestamp}`,
    externalId: `ext-${timestamp}`,
    timestamp: new Date(timestamp),
    source: "desktop",
    watcher,
    duration: durationMs,
    data: { application, title: `${application} window` },
  };
}

function correctionRow() {
  return {
    id: "corr-1",
    userId: "user-1",
    windowStart: new Date("2026-10-18T09:30:00.000Z"),
    windowEnd: new Date("2026-10-18T09:35:00.000Z"),
    targetKind: "TASK",
    taskId: "task-2",
    taskTitleSnapshot: "Task Beta",
    reason: null,
    supersedesCorrectionId: null,
    createdAt: new Date("2026-10-18T08:00:00.000Z"),
  };
}

function checkInRow() {
  return {
    id: "ci-1",
    userId: "user-1",
    workSessionId: null,
    taskId: "task-1",
    windowStart: new Date("2026-10-18T09:20:00.000Z"),
    windowEnd: new Date("2026-10-18T09:25:00.000Z"),
    activityAssessment: "productive",
    alignment: "yes",
    reasons: [],
    state: "neutral",
    energy: null,
    focus: null,
    note: null,
    questionVersion: "v1",
    source: "manual",
    deeperAnswers: null,
    intent: null,
    progress: null,
    blocker: null,
    productive: null,
    outcome: null,
    createdAt: new Date("2026-10-18T09:26:00.000Z"),
  };
}

function observedDb(overrides: {
  task?: unknown;
  sessions?: unknown[];
  events?: unknown[];
  corrections?: unknown[];
  checkIns?: unknown[];
}) {
  const sessions = overrides.sessions ?? [];
  const task = overrides.task === undefined ? taskRow(sessions) : overrides.task;
  return {
    task: { findFirst: async () => task },
    workSession: { findMany: async () => sessions },
    normalizedActivity: { findMany: async () => overrides.events ?? [] },
    workContext: { findMany: async () => [] },
    attributionCorrection: { findMany: async () => overrides.corrections ?? [] },
    checkIn: { findMany: async () => overrides.checkIns ?? [] },
    userGapExplanation: { findMany: async () => [] },
  };
}

describe("getTaskObservedActivity (Slice C evidence attribution)", () => {
  it("counts only evidence blocks attributed to this task; corrected-away and AFK time are excluded", async () => {
    setTestDb(
      observedDb({
        sessions: [sessionRow("task-1")],
        events: [
          eventRow("2026-10-18T09:10:00.000Z", 600, "Code.exe"),
          eventRow("2026-10-18T09:30:00.000Z", 300, "chrome.exe"),
          eventRow("2026-10-18T09:45:00.000Z", 300, "Code.exe", "afk"),
          eventRow("2026-10-18T09:55:00.000Z", 180, "Terminal.exe"),
        ],
        corrections: [correctionRow()],
      }),
    );

    const items = await getTaskObservedActivity("user-1", "task-1");
    const byApp = Object.fromEntries(items.map((i) => [i.application, i]));

    // chrome.exe [09:30,09:35) was corrected to task-2 -> excluded.
    // The AFK block [09:45,09:50) -> excluded.
    expect(Object.keys(byApp).sort()).toEqual(["Terminal", "Visual Studio Code"]);
    expect(byApp["Visual Studio Code"]!.durationSeconds).toBe(600);
    expect(byApp["Terminal"]!.durationSeconds).toBe(180);
    expect(byApp["Visual Studio Code"]!.percentage).toBe(77);
    expect(byApp["Terminal"]!.percentage).toBe(23);
  });

  it("never counts observed telemetry with no task intention (unlinked is not attribution)", async () => {
    setTestDb(
      observedDb({
        sessions: [sessionRow(null)],
        events: [eventRow("2026-10-18T09:10:00.000Z", 600, "Code.exe")],
      }),
    );
    expect(await getTaskObservedActivity("user-1", "task-1")).toEqual([]);
  });

  it("a check-in report over a telemetry gap is never treated as observed proof", async () => {
    setTestDb(
      observedDb({
        sessions: [sessionRow("task-1")],
        events: [eventRow("2026-10-18T09:10:00.000Z", 600, "Code.exe")],
        checkIns: [checkInRow()],
      }),
    );

    const items = await getTaskObservedActivity("user-1", "task-1");
    // Only the 10-minute observed block counts; the REPORTED-only
    // [09:20,09:25) check-in window adds nothing.
    expect(items).toHaveLength(1);
    expect(items[0]!.durationSeconds).toBe(600);
    expect(items[0]!.percentage).toBe(100);
  });

  it("returns empty for an unknown task or a task without sessions", async () => {
    setTestDb(observedDb({ task: null }));
    expect(await getTaskObservedActivity("user-1", "task-x")).toEqual([]);

    setTestDb(observedDb({ sessions: [] }));
    expect(await getTaskObservedActivity("user-1", "task-1")).toEqual([]);
  });
});
