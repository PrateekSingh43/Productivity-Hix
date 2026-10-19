import { afterEach, describe, expect, it } from "vitest";
import { resetTestDb, setTestDb } from "../../lib/prisma";
import { createCorrection, listCorrections } from "./service";

afterEach(resetTestDb);

/**
 * Phase 1 AttributionCorrection service contract (R1/R2).
 *
 * Pins: append-only writes (no UPDATE/DELETE path anywhere), explicit
 * targetKind ("TASK" | "NONE"), server-side task-title snapshot, backward
 * supersedes pointer validated to the caller's own corrections, and window
 * validation. Corrections are the highest-precedence attribution source.
 */

type Row = {
  id: string;
  userId: string;
  windowStart: Date;
  windowEnd: Date;
  targetKind: string;
  taskId: string | null;
  taskTitleSnapshot: string | null;
  reason: string | null;
  supersedesCorrectionId: string | null;
  createdAt: Date;
};

function corrRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "corr-1",
    userId: "user-1",
    windowStart: new Date("2026-10-18T09:00:00.000Z"),
    windowEnd: new Date("2026-10-18T10:00:00.000Z"),
    targetKind: "TASK",
    taskId: "task-1",
    taskTitleSnapshot: "Deep work",
    reason: null,
    supersedesCorrectionId: null,
    createdAt: new Date("2026-10-18T11:00:00.000Z"),
    ...overrides,
  };
}

function corrMock(options: {
  task?: { id: string; title: string } | null;
  supersedes?: { id: string } | null;
  rows?: Row[];
  calls?: string[];
  onCreate?: (data: Record<string, unknown>) => void;
}) {
  const calls = options.calls ?? [];
  return {
    task: {
      findFirst: async () => {
        calls.push("task.findFirst");
        return options.task ?? null;
      },
    },
    attributionCorrection: {
      findFirst: async () => {
        calls.push("correction.findFirst");
        return options.supersedes ?? null;
      },
      findMany: async (args: { orderBy?: unknown; take?: number; where?: unknown }) => {
        calls.push(`findMany:${JSON.stringify(args)}`);
        return options.rows ?? [];
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("create");
        options.onCreate?.(data);
        return { ...corrRow(), ...(data as Partial<Row>) };
      },
      // Append-only guard rails: any update/delete attempt fails loudly.
      update: async () => {
        calls.push("update");
        throw new Error("append-only: update is forbidden");
      },
      delete: async () => {
        calls.push("delete");
        throw new Error("append-only: delete is forbidden");
      },
    },
  };
}

const WINDOW = {
  windowStart: new Date("2026-10-18T09:00:00.000Z"),
  windowEnd: new Date("2026-10-18T10:00:00.000Z"),
};

describe("createCorrection (R1/R2)", () => {
  it("TASK correction snapshots the task title server-side and never mutates history", async () => {
    const created: Array<Record<string, unknown>> = [];
    const calls: string[] = [];
    setTestDb(
      corrMock({
        task: { id: "task-1", title: "Trace the useQuery lifecycle" },
        calls,
        onCreate: (data) => created.push(data),
      }),
    );
    const out = await createCorrection("user-1", {
      ...WINDOW,
      targetKind: "TASK",
      taskId: "task-1",
      reason: "Pomodoro drift",
    });
    expect(created).toHaveLength(1);
    expect(created[0]?.targetKind).toBe("TASK");
    expect(created[0]?.taskId).toBe("task-1");
    expect(created[0]?.taskTitleSnapshot).toBe("Trace the useQuery lifecycle");
    expect(created[0]?.supersedesCorrectionId).toBeNull();
    expect(out.targetKind).toBe("TASK");
    expect(out.taskTitleSnapshot).toBe("Trace the useQuery lifecycle");
    expect(calls).not.toContain("update");
    expect(calls).not.toContain("delete");
  });

  it("NONE correction stores no task id and no snapshot", async () => {
    const created: Array<Record<string, unknown>> = [];
    setTestDb(corrMock({ onCreate: (data) => created.push(data) }));
    const out = await createCorrection("user-1", { ...WINDOW, targetKind: "NONE" });
    expect(created[0]?.taskId).toBeNull();
    expect(created[0]?.taskTitleSnapshot).toBeNull();
    expect(out.targetKind).toBe("NONE");
  });

  it("TASK correction without a taskId is rejected with 400", async () => {
    setTestDb(corrMock({}));
    const err = await createCorrection("user-1", { ...WINDOW, targetKind: "TASK" }).catch((e) => e);
    expect(err?.statusCode).toBe(400);
  });

  it("unknown or foreign task is rejected with 404", async () => {
    setTestDb(corrMock({ task: null }));
    const err = await createCorrection("user-1", {
      ...WINDOW,
      targetKind: "TASK",
      taskId: "task-other",
    }).catch((e) => e);
    expect(err?.statusCode).toBe(404);
  });

  it("a window that does not advance is rejected with 400", async () => {
    setTestDb(corrMock({ task: { id: "task-1", title: "Deep work" } }));
    const err = await createCorrection("user-1", {
      windowStart: WINDOW.windowEnd,
      windowEnd: WINDOW.windowStart,
      targetKind: "TASK",
      taskId: "task-1",
    }).catch((e) => e);
    expect(err?.statusCode).toBe(400);
  });

  it("a valid supersedes pointer is stored; an unknown one is rejected with 400", async () => {
    const created: Array<Record<string, unknown>> = [];
    setTestDb(
      corrMock({
        task: { id: "task-1", title: "Deep work" },
        supersedes: { id: "corr-prev" },
        onCreate: (data) => created.push(data),
      }),
    );
    await createCorrection("user-1", {
      ...WINDOW,
      targetKind: "TASK",
      taskId: "task-1",
      supersedesCorrectionId: "corr-prev",
    });
    expect(created[0]?.supersedesCorrectionId).toBe("corr-prev");

    resetTestDb();
    setTestDb(corrMock({ task: { id: "task-1", title: "Deep work" }, supersedes: null }));
    const err = await createCorrection("user-1", {
      ...WINDOW,
      targetKind: "TASK",
      taskId: "task-1",
      supersedesCorrectionId: "corr-missing",
    }).catch((e) => e);
    expect(err?.statusCode).toBe(400);
  });
});

describe("listCorrections (R1)", () => {
  it("lists overlapping corrections newest-first with a bounded limit", async () => {
    const calls: string[] = [];
    setTestDb(corrMock({ rows: [corrRow()], calls }));
    const out = await listCorrections("user-1", {
      from: new Date("2026-10-18T08:00:00.000Z"),
      to: new Date("2026-10-18T12:00:00.000Z"),
      taskId: "task-1",
      limit: 9999,
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("corr-1");
    expect(out[0]?.windowStart).toBe("2026-10-18T09:00:00.000Z");
    expect(out[0]?.createdAt).toBe("2026-10-18T11:00:00.000Z");
    const many = calls.find((c) => c.startsWith("findMany:"));
    expect(many).toBeTruthy();
    expect(many).toContain('"createdAt":"desc"');
    expect(many).toContain('"take":500');
    expect(many).toContain('"taskId":"task-1"');
    expect(many).toContain('"windowStart":{"lt"');
    expect(many).toContain('"windowEnd":{"gt"');
  });
});
