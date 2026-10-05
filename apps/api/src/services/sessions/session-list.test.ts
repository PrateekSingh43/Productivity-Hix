import { afterEach, describe, expect, it } from "vitest";
import { resetTestDb, setTestDb } from "../../lib/prisma";
import { listSessions } from "./service";

afterEach(resetTestDb);

/**
 * Pins the session list contract (mission Phase 3):
 * - `linked` structural filter maps to the correct taskId constraint.
 * - `hasReflection` reflects CheckIn presence per session (one batched
 *   lookup, tolerant of delegates without a checkIn model).
 */

const ROW = (id: string, taskId: string | null) => ({
  id,
  userId: "user-1",
  taskId,
  startedAt: new Date("2026-09-30T08:00:00.000Z"),
  endedAt: new Date("2026-09-30T09:00:00.000Z"),
  durationSeconds: 3600,
  targetDurationMinutes: 60,
  isPaused: false,
  pausedAt: null,
  lastResumedAt: new Date("2026-09-30T08:00:00.000Z"),
  source: "manual",
  notes: null,
  createdAt: new Date("2026-09-30T08:00:00.000Z"),
  task: null,
});

function mockDb(opts: {
  rows: ReturnType<typeof ROW>[];
  reflectedIds?: string[];
  withCheckIn?: boolean;
  captured?: { where?: unknown };
}) {
  const db: Record<string, unknown> = {
    workSession: {
      findMany: async ({ where }: { where: unknown }) => {
        if (opts.captured) opts.captured.where = where;
        return opts.rows;
      },
    },
  };
  if (opts.withCheckIn) {
    db.checkIn = {
      findMany: async () =>
        (opts.reflectedIds ?? []).map((workSessionId) => ({ workSessionId })),
    };
  }
  setTestDb(db);
}

describe("session list linked filter", () => {
  it("linked=linked constrains taskId to non-null", async () => {
    const captured: { where?: unknown } = {};
    mockDb({ rows: [], captured });
    await listSessions("user-1", { linked: "linked" });
    expect(captured.where).toMatchObject({ taskId: { not: null } });
  });

  it("linked=independent constrains taskId to null", async () => {
    const captured: { where?: unknown } = {};
    mockDb({ rows: [], captured });
    await listSessions("user-1", { linked: "independent" });
    expect(captured.where).toMatchObject({ taskId: null });
  });

  it("omitted linked leaves taskId unconstrained", async () => {
    const captured: { where?: unknown } = {};
    mockDb({ rows: [], captured });
    await listSessions("user-1", {});
    expect(captured.where).not.toHaveProperty("taskId");
  });
});

describe("session list hasReflection", () => {
  it("marks sessions with a check-in", async () => {
    mockDb({
      rows: [ROW("s-1", "task-1"), ROW("s-2", null)],
      reflectedIds: ["s-1"],
      withCheckIn: true,
    });
    const out = await listSessions("user-1", {});
    expect(out.find((s) => s.id === "s-1")?.hasReflection).toBe(true);
    expect(out.find((s) => s.id === "s-2")?.hasReflection).toBe(false);
  });

  it("defaults to false when no checkIn delegate exists", async () => {
    mockDb({ rows: [ROW("s-1", "task-1")], withCheckIn: false });
    const out = await listSessions("user-1", {});
    expect(out[0]?.hasReflection).toBe(false);
  });
});
