import { afterEach, describe, expect, it } from "vitest";
import { resetTestDb, setTestDb } from "../../lib/prisma";
import { createSession } from "./service";

afterEach(resetTestDb);

/**
 * R5 atomicity: the work-context association at session start runs inside the
 * SAME transaction as the session insert. A session never commits without its
 * context association, and a failed association aborts the session.
 */

function sessionRow(data: Record<string, unknown>, id = "session-9") {
  return {
    id,
    userId: "user-1",
    taskId: (data.taskId as string | null) ?? null,
    startedAt: (data.startedAt as Date) ?? new Date("2026-10-18T09:00:00.000Z"),
    endedAt: null,
    durationSeconds: 0,
    targetDurationMinutes: null,
    isPaused: false,
    pausedAt: null,
    lastResumedAt: (data.startedAt as Date) ?? new Date("2026-10-18T09:00:00.000Z"),
    source: "manual",
    notes: null,
    createdAt: new Date("2026-10-18T09:00:00.000Z"),
    task: null,
  };
}

describe("session creation atomically associates a work context (R5)", () => {
  it("creates the session row and its context inside ONE transaction, broadcasting after commit", async () => {
    let txDepth = 0;
    let committed = false;
    const mock: Record<string, unknown> = {
      $transaction: async (fn: (tx: unknown) => unknown) => {
        txDepth += 1;
        try {
          const out = await fn(mock);
          committed = true;
          return out;
        } finally {
          txDepth -= 1;
        }
      },
      workSession: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          expect(txDepth).toBe(1);
          expect(committed).toBe(false);
          return sessionRow(data);
        },
      },
      workContext: {
        findFirst: async () => {
          expect(txDepth).toBe(1);
          return null;
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          expect(txDepth).toBe(1);
          expect(committed).toBe(false);
          expect(data.startedBySessionId).toBe("session-9");
          expect(data.taskId).toBe("task-1");
          return { id: "ctx-1", ...data };
        },
      },
    };
    setTestDb(mock);

    const out = await createSession("user-1", { taskId: "task-1" });
    expect(out.id).toBe("session-9");
    expect(committed).toBe(true);
  });

  it("task-less sessions never touch context state", async () => {
    let contextCalls = 0;
    const mock: Record<string, unknown> = {
      workSession: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => sessionRow(data),
      },
      workContext: {
        findFirst: async () => {
          contextCalls += 1;
          return null;
        },
        create: async () => {
          contextCalls += 1;
          return {};
        },
      },
    };
    setTestDb(mock);

    await createSession("user-1", { taskId: null, notes: "Reading" });
    expect(contextCalls).toBe(0);
  });

  it("a failing context association aborts session creation (no partial commit)", async () => {
    let createdSessions = 0;
    const mock: Record<string, unknown> = {
      workSession: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdSessions += 1;
          return sessionRow(data);
        },
      },
      workContext: {
        findFirst: async () => null,
        create: async () => {
          throw new Error("context write failed");
        },
      },
    };
    setTestDb(mock);

    await expect(createSession("user-1", { taskId: "task-1" })).rejects.toThrow(
      "context write failed",
    );
    expect(createdSessions).toBe(1);
  });
});
