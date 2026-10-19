import { afterEach, describe, expect, it } from "vitest";
import { resetTestDb, setTestDb } from "../../lib/prisma";
import {
  ensureContextForSessionStart,
  endContext,
  getCurrentContext,
  listContextHistory,
  switchContext,
} from "./service";

afterEach(resetTestDb);

/**
 * Phase 1 WorkContext service contract (R5).
 *
 * Pins: one open context per user (partial unique index backed), atomic
 * close+open switching, same-target idempotency, append-only history (no
 * mutation of closed intervals), SESSION_ASSOCIATED vs SWITCHED reasons, and
 * that context switching NEVER mutates WorkSession rows.
 */

type Row = {
  id: string;
  userId: string;
  taskId: string | null;
  goalId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  startedBySessionId: string | null;
  endedReason: string | null;
  createdAt: Date;
};

function ctxRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "ctx-1",
    userId: "user-1",
    taskId: "task-1",
    goalId: null,
    startedAt: new Date("2026-10-18T09:00:00.000Z"),
    endedAt: null,
    startedBySessionId: null,
    endedReason: null,
    createdAt: new Date("2026-10-18T09:00:00.000Z"),
    ...overrides,
  };
}

function ctxMock(options: {
  open?: Row | null;
  calls?: string[];
  onCreate?: (data: Record<string, unknown>) => void | never;
  onCreateReturn?: (data: Record<string, unknown>) => Row;
}) {
  const calls = options.calls ?? [];
  return {
    workContext: {
      findFirst: async () => {
        calls.push("findFirst");
        return options.open ?? null;
      },
      findMany: async (args: { orderBy?: unknown; take?: number }) => {
        calls.push(`findMany:${JSON.stringify(args)}`);
        return options.open ? [options.open] : [];
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.push("update");
        if (options.open) {
          return { ...options.open, ...data, id: where.id } as Row;
        }
        return ctxRow({ id: where.id, ...data } as Partial<Row>);
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("create");
        if (options.onCreate) {
          options.onCreate(data);
        }
        if (options.onCreateReturn) {
          return options.onCreateReturn(data);
        }
        return ctxRow({ id: "ctx-2", ...(data as Partial<Row>) });
      },
    },
  };
}

describe("work context switching (R5)", () => {
  it("same-target switch is a no-op: no close/open pair, one continuous interval preserved", async () => {
    const calls: string[] = [];
    setTestDb(ctxMock({ open: ctxRow(), calls }));
    const result = await switchContext("user-1", { taskId: "task-1" });
    expect(calls.filter((c) => c === "update")).toHaveLength(0);
    expect(calls.filter((c) => c === "create")).toHaveLength(0);
    expect(result.context.id).toBe("ctx-1");
    expect(result.context.endedAt).toBeNull();
    expect(result.previous).toBeNull();
  });

  it("different-target switch closes the previous interval (SWITCHED) and opens the new one in one transaction", async () => {
    const calls: string[] = [];
    setTestDb(ctxMock({ open: ctxRow(), calls }));
    const result = await switchContext("user-1", { taskId: "task-2" });
    expect(calls).toContain("update");
    expect(calls).toContain("create");
    expect(calls.indexOf("update")).toBeLessThan(calls.indexOf("create"));
    expect(result.previous?.id).toBe("ctx-1");
    expect(result.previous?.endedReason).toBe("SWITCHED");
    expect(result.previous?.endedAt).not.toBeNull();
    expect(result.context.taskId).toBe("task-2");
    expect(result.context.endedAt).toBeNull();
  });

  it("switch with no open context only opens one", async () => {
    const calls: string[] = [];
    setTestDb(ctxMock({ open: null, calls }));
    const result = await switchContext("user-1", { taskId: "task-1" });
    expect(calls.filter((c) => c === "update")).toHaveLength(0);
    expect(result.previous).toBeNull();
    expect(result.context.taskId).toBe("task-1");
  });

  it("losing the concurrent-switch race (P2002 from the partial unique index) maps to 409", async () => {
    setTestDb(
      ctxMock({
        open: null,
        onCreate: () => {
          const error = new Error("Unique constraint failed") as Error & { code?: string };
          error.code = "P2002";
          throw error;
        },
      }),
    );
    const err = await switchContext("user-1", { taskId: "task-1" }).catch((e) => e);
    expect(err?.statusCode).toBe(409);
  });

  it("switch requires an explicit target", async () => {
    const err = await switchContext("user-1", {}).catch((e) => e);
    expect(err?.statusCode).toBe(400);
  });

  it("switching contexts NEVER mutates work sessions", async () => {
    const sessionCalls: string[] = [];
    setTestDb({
      ...ctxMock({ open: ctxRow(), calls: [] }),
      workSession: {
        findFirst: async () => {
          sessionCalls.push("findFirst");
          return null;
        },
        update: async () => {
          sessionCalls.push("update");
          return {};
        },
        delete: async () => {
          sessionCalls.push("delete");
          return {};
        },
      },
    });
    await switchContext("user-1", { taskId: "task-2" });
    expect(sessionCalls).toHaveLength(0);
  });
});

describe("work context end + read model (R5)", () => {
  it("end closes the open context with USER_ENDED", async () => {
    setTestDb(ctxMock({ open: ctxRow() }));
    const result = await endContext("user-1");
    expect(result.context?.id).toBe("ctx-1");
    expect(result.context?.endedReason).toBe("USER_ENDED");
    expect(result.context?.endedAt).not.toBeNull();
  });

  it("end with no open context is a no-op returning none", async () => {
    const calls: string[] = [];
    setTestDb(ctxMock({ open: null, calls }));
    const result = await endContext("user-1");
    expect(result.context).toBeNull();
    expect(calls.filter((c) => c === "update")).toHaveLength(0);
  });

  it("current returns the single open context or null", async () => {
    setTestDb(ctxMock({ open: ctxRow() }));
    const open = await getCurrentContext("user-1");
    expect(open?.id).toBe("ctx-1");
    expect(open?.startedAt).toBe("2026-10-18T09:00:00.000Z");

    resetTestDb();
    setTestDb(ctxMock({ open: null }));
    expect(await getCurrentContext("user-1")).toBeNull();
  });

  it("history returns contexts newest-first with a bounded limit", async () => {
    const calls: string[] = [];
    setTestDb(ctxMock({ open: ctxRow(), calls }));
    await listContextHistory("user-1", { taskId: "task-1", limit: 9999 });
    const many = calls.find((c) => c.startsWith("findMany:"));
    expect(many).toBeTruthy();
    expect(many).toContain('"startedAt":"desc"');
    expect(many).toContain('"take":500');
    expect(many).toContain('"taskId":"task-1"');
  });
});

describe("ensureContextForSessionStart (R5, test gates 2-4)", () => {
  it("creates a context for a task session, recording startedBySessionId", async () => {
    const created: Array<Record<string, unknown>> = [];
    const tx = ctxMock({
      open: null,
      onCreate: (data) => created.push(data),
    });
    await ensureContextForSessionStart(tx as never, "user-1", {
      taskId: "task-1",
      sessionId: "session-1",
      startedAt: new Date("2026-10-18T09:00:00.000Z"),
    });
    expect(created).toHaveLength(1);
    expect(created[0]?.taskId).toBe("task-1");
    expect(created[0]?.startedBySessionId).toBe("session-1");
    expect(created[0]?.endedAt).toBeNull();
  });

  it("adopts an existing same-task open context by recording the session id", async () => {
    const calls: string[] = [];
    const tx = ctxMock({ open: ctxRow(), calls });
    await ensureContextForSessionStart(tx as never, "user-1", {
      taskId: "task-1",
      sessionId: "session-1",
      startedAt: new Date("2026-10-18T09:00:00.000Z"),
    });
    expect(calls).toContain("update");
    expect(calls).not.toContain("create");
  });

  it("closes a differing open context with SESSION_ASSOCIATED and opens the session task's context", async () => {
    const calls: string[] = [];
    const tx = ctxMock({ open: ctxRow({ taskId: "task-old" }), calls });
    await ensureContextForSessionStart(tx as never, "user-1", {
      taskId: "task-1",
      sessionId: "session-1",
      startedAt: new Date("2026-10-18T10:00:00.000Z"),
    });
    expect(calls.indexOf("update")).toBeLessThan(calls.indexOf("create"));
  });

  it("is a no-op for task-less sessions (never touches work context state)", async () => {
    const calls: string[] = [];
    const tx = ctxMock({ open: ctxRow(), calls });
    await ensureContextForSessionStart(tx as never, "user-1", {
      taskId: null,
      sessionId: "session-1",
      startedAt: new Date("2026-10-18T09:00:00.000Z"),
    });
    expect(calls).toHaveLength(0);
  });
});
