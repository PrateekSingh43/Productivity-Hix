import { afterEach, describe, expect, it, vi } from "vitest";
import { resetTestDb, setTestDb } from "../../lib/prisma";
import { updateTask } from "./service";

afterEach(resetTestDb);

/**
 * Pins the Task lifecycle date invariants (mission Part 27):
 * - createdAt is never rewritten by updates (Prisma @default + no write path).
 * - dueAt remains the deadline; completing never clears or rewrites it.
 * - completedAt is set on done, cleared on any other status, preserved when
 *   status is omitted.
 * - productiveDate (schedule) is clamped <= dueAt and every genuine change is
 *   appended to the append-only schedule-history audit.
 */

const BASE_TASK = {
  id: "task-1",
  userId: "user-1",
  goalId: null,
  productiveDate: "2026-09-29",
  title: "Trace the useQuery lifecycle",
  description: null,
  status: "todo",
  priority: "medium",
  plannedDurationMinutes: 60,
  plannedStart: null,
  dueAt: new Date("2026-09-29T23:59:59.000Z"),
  completedAt: null,
  createdAt: new Date("2026-09-29T05:00:00.000Z"),
  updatedAt: new Date("2026-09-29T05:00:00.000Z"),
};

/** Emulates Prisma `update`: undefined fields mean "no change". */
function prismaUpdate(base: Record<string, unknown>) {
  return async ({ data }: { data: Record<string, unknown> }) => {
    const applied: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) applied[k] = v;
    }
    return { ...applied, goal: null, sessions: [] };
  };
}

function mockDb(base: Record<string, unknown>, auditSpy?: { create: ReturnType<typeof vi.fn> }) {
  const task = {
    findFirst: async () => ({
      productiveDate: (base.productiveDate as string | null) ?? null,
      dueAt: (base.dueAt as Date | null) ?? null,
    }),
    update: prismaUpdate(base),
  };
  const db: Record<string, unknown> = { task };
  if (auditSpy) db.taskScheduleHistory = auditSpy;
  setTestDb(db);
  return task;
}

describe("task lifecycle dates", () => {
  it("done sets completedAt without touching createdAt or dueAt", async () => {
    mockDb({ ...BASE_TASK });
    const out = await updateTask("user-1", "task-1", { status: "done" });
    expect(out.status).toBe("done");
    expect(out.completedAt).not.toBeNull();
    expect(out.createdAt).toBe(BASE_TASK.createdAt.toISOString());
    expect(out.dueAt).toBe(BASE_TASK.dueAt!.toISOString());
  });

  it("reopening (todo) clears completedAt", async () => {
    mockDb({ ...BASE_TASK, status: "done", completedAt: new Date("2026-09-29T19:49:00.000Z") });
    const out = await updateTask("user-1", "task-1", { status: "todo" });
    expect(out.status).toBe("todo");
    expect(out.completedAt).toBeNull();
  });

  it("omitted status preserves completedAt", async () => {
    const doneAt = new Date("2026-09-29T19:49:00.000Z");
    mockDb({ ...BASE_TASK, status: "done", completedAt: doneAt });
    const out = await updateTask("user-1", "task-1", { title: "Renamed" });
    expect(out.completedAt).toBe(doneAt.toISOString());
  });

  it("due date change on a done task keeps completedAt", async () => {
    const doneAt = new Date("2026-09-29T19:49:00.000Z");
    mockDb({ ...BASE_TASK, status: "done", completedAt: doneAt });
    const out = await updateTask("user-1", "task-1", {
      dueAt: new Date("2026-09-30T23:59:59.000Z"),
    });
    expect(out.dueAt).toBe(new Date("2026-09-30T23:59:59.000Z").toISOString());
    expect(out.completedAt).toBe(doneAt.toISOString());
  });

  it("clamps a future schedule forward to an earlier deadline", async () => {
    mockDb({ ...BASE_TASK, productiveDate: "2026-10-02" });
    // Mid-day UTC keeps the productive-day assertion stable across timezones.
    const out = await updateTask("user-1", "task-1", {
      dueAt: new Date("2026-09-30T12:00:00.000Z"),
    });
    expect(out.productiveDate).toBe("2026-09-30");
  });

  it("appends a schedule-history row on genuine productiveDate change", async () => {
    const create = vi.fn(async () => ({ id: "audit-1" }));
    mockDb({ ...BASE_TASK }, { create });
    await updateTask("user-1", "task-1", { productiveDate: "2026-09-30" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: { userId: "user-1", taskId: "task-1", fromDate: "2026-09-29", toDate: "2026-09-30" },
    });
  });
});
