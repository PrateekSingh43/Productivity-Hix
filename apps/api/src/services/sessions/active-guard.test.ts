import { afterEach, describe, expect, it } from "vitest";
import { resetTestDb, setTestDb } from "../../lib/prisma";
import { createSession } from "./service";

afterEach(resetTestDb);

/**
 * Pins the one-active-session invariant (duplicate starts must fail loudly
 * instead of silently forking a second live session that no timer can pause
 * or discard coherently).
 */

const ACTIVE_ROW = {
  id: "session-live",
  userId: "user-1",
  taskId: null,
  startedAt: new Date("2026-09-30T08:00:00.000Z"),
  endedAt: null,
  durationSeconds: 1200,
  targetDurationMinutes: 25,
  isPaused: false,
  pausedAt: null,
  lastResumedAt: new Date("2026-09-30T08:00:00.000Z"),
  source: "manual",
  notes: null,
  createdAt: new Date("2026-09-30T08:00:00.000Z"),
  task: null,
};

describe("one-active-session invariant", () => {
  it("rejects a second concurrent session with 409", async () => {
    const created: unknown[] = [];
    setTestDb({
      workSession: {
        findFirst: async () => ACTIVE_ROW,
        create: async ({ data }: { data: unknown }) => {
          created.push(data);
          return { ...ACTIVE_ROW, id: "session-duplicate" };
        },
      },
    });
    const err = await createSession("user-1", { taskId: null }).catch((e) => e);
    expect(err?.statusCode).toBe(409);
    expect(String(err?.message ?? "")).toMatch(/already active/i);
    expect(created).toHaveLength(0);
  });

  it("allows creating when no session is active", async () => {
    setTestDb({
      workSession: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          ...ACTIVE_ROW,
          id: "session-new",
          taskId: (data.taskId as string | null) ?? null,
          targetDurationMinutes: (data.targetDurationMinutes as number | null) ?? null,
          notes: (data.notes as string | null) ?? null,
        }),
      },
    });
    const out = await createSession("user-1", { taskId: null });
    expect(out.id).toBe("session-new");
    expect(out.endedAt).toBeNull();
  });
});
