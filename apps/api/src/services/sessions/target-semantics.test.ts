import { afterEach, describe, expect, it } from "vitest";
import { resetTestDb, setTestDb } from "../../lib/prisma";
import { createSession } from "./service";

afterEach(resetTestDb);

/**
 * Pins session-target independence (mission Phase 2):
 * a session target is the target of ONE execution block and is never
 * inherited from, nor fallen back to, the linked task's planned duration.
 * Omitted targets persist and serialize as null ("Target not set").
 */

function mockDb(captured: { data?: Record<string, unknown> }) {
  setTestDb({
    workSession: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        captured.data = data;
        return {
          id: "session-1",
          userId: "user-1",
          taskId: (data.taskId as string | null) ?? null,
          startedAt: (data.startedAt as Date) ?? new Date("2026-09-30T08:00:00.000Z"),
          endedAt: (data.endedAt as Date | null) ?? null,
          durationSeconds: (data.durationSeconds as number | null) ?? 0,
          targetDurationMinutes: (data.targetDurationMinutes as number | null) ?? null,
          isPaused: false,
          pausedAt: null,
          lastResumedAt: (data.startedAt as Date) ?? new Date("2026-09-30T08:00:00.000Z"),
          source: "manual",
          notes: (data.notes as string | null) ?? null,
          createdAt: new Date("2026-09-30T08:00:00.000Z"),
          task: {
            title: "Trace the useQuery lifecycle",
            plannedDurationMinutes: 60,
            goal: { title: "Learn TanStack Query" },
          },
        };
      },
    },
  });
}

describe("session target semantics", () => {
  it("does not inherit the task planned duration when no target is passed", async () => {
    const captured: { data?: Record<string, unknown> } = {};
    mockDb(captured);
    const out = await createSession("user-1", { taskId: "task-1", notes: "Deep work" });
    expect(captured.data?.targetDurationMinutes).toBeNull();
    expect(out.targetDurationMinutes).toBeNull();
    // Task context still resolves for display; only the target stays null.
    expect(out.taskTitle).toBe("Trace the useQuery lifecycle");
  });

  it("stores an explicitly passed target untouched", async () => {
    const captured: { data?: Record<string, unknown> } = {};
    mockDb(captured);
    const out = await createSession("user-1", {
      taskId: "task-1",
      targetDurationMinutes: 45,
    });
    expect(captured.data?.targetDurationMinutes).toBe(45);
    expect(out.targetDurationMinutes).toBe(45);
  });

  it("independent sessions persist null target and null task", async () => {
    const captured: { data?: Record<string, unknown> } = {};
    mockDb(captured);
    const out = await createSession("user-1", { taskId: null, notes: "Reading" });
    expect(out.taskId).toBeNull();
    expect(out.targetDurationMinutes).toBeNull();
  });
});
