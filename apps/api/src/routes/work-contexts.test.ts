import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { resetTestDb, setTestDb } from "../lib/prisma";

const DEV_USER = "cuid_dev_user_001";

beforeEach(() => {
  vi.stubEnv("ALLOW_DEV_AUTH", "true");
});

afterEach(() => {
  resetTestDb();
  vi.unstubAllEnvs();
});

type OpenRow = {
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

function workContextDb() {
  let open: OpenRow | null = null;
  let seq = 0;
  const db: Record<string, unknown> = {
    workContext: {
      findFirst: async ({ where }: { where: { endedAt?: null } }) => {
        if (where?.endedAt === null) return open && open.endedAt === null ? open : null;
        return open;
      },
      findMany: async () => (open ? [open] : []),
      update: async ({ data }: { data: Partial<OpenRow> }) => {
        open = { ...(open as OpenRow), ...data };
        return open;
      },
      create: async ({ data }: { data: Partial<OpenRow> }) => {
        seq += 1;
        open = {
          id: `ctx-${seq}`,
          userId: DEV_USER,
          taskId: data.taskId ?? null,
          goalId: data.goalId ?? null,
          startedAt: (data.startedAt as Date) ?? new Date("2026-10-18T09:00:00.000Z"),
          endedAt: data.endedAt ?? null,
          startedBySessionId: data.startedBySessionId ?? null,
          endedReason: data.endedReason ?? null,
          createdAt: new Date("2026-10-18T09:00:00.000Z"),
        };
        return open;
      },
    },
  };
  return { db, getOpen: () => open };
}

function correctionsDb() {
  const created: Array<Record<string, unknown>> = [];
  const rows: Array<Record<string, unknown>> = [];
  const db: Record<string, unknown> = {
    task: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        where.id === "task-1"
          ? { id: "task-1", title: "Trace the useQuery lifecycle" }
          : null,
    },
    attributionCorrection: {
      findFirst: async () => null,
      findMany: async () => rows,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        const row = {
          id: `corr-${created.length}`,
          createdAt: new Date("2026-10-18T11:00:00.000Z"),
          ...data,
        };
        rows.push(row);
        return row;
      },
      update: async () => {
        throw new Error("append-only");
      },
      delete: async () => {
        throw new Error("append-only");
      },
    },
  };
  return { db, created };
}

describe("work contexts API (R5)", () => {
  it("requires authentication", async () => {
    vi.stubEnv("ALLOW_DEV_AUTH", "false");
    setTestDb(workContextDb().db);
    const res = await request(createApp()).get("/api/work-contexts/current");
    expect(res.status).toBe(401);
  });

  it("rejects a switch without a target with 400", async () => {
    setTestDb(workContextDb().db);
    const res = await request(createApp())
      .post("/api/work-contexts/switch")
      .set("x-user-id", DEV_USER)
      .send({});
    expect(res.status).toBe(400);
  });

  it("switches, reads current, then switches again closing the previous interval", async () => {
    const { db, getOpen } = workContextDb();
    setTestDb(db);

    const first = await request(createApp())
      .post("/api/work-contexts/switch")
      .set("x-user-id", DEV_USER)
      .send({ taskId: "task-1" });
    expect(first.status).toBe(200);
    expect(first.body.context.taskId).toBe("task-1");
    expect(first.body.context.endedAt).toBeNull();

    const current = await request(createApp())
      .get("/api/work-contexts/current")
      .set("x-user-id", DEV_USER);
    expect(current.status).toBe(200);
    expect(current.body.taskId).toBe("task-1");

    const second = await request(createApp())
      .post("/api/work-contexts/switch")
      .set("x-user-id", DEV_USER)
      .send({ taskId: "task-2" });
    expect(second.status).toBe(200);
    expect(second.body.previous.endedReason).toBe("SWITCHED");
    expect(second.body.context.taskId).toBe("task-2");
    expect(getOpen()?.endedAt).toBeNull();
  });

  it("ends the open context with USER_ENDED and reports none afterwards", async () => {
    const { db, getOpen } = workContextDb();
    setTestDb(db);

    await request(createApp())
      .post("/api/work-contexts/switch")
      .set("x-user-id", DEV_USER)
      .send({ taskId: "task-1" });

    const ended = await request(createApp())
      .post("/api/work-contexts/end")
      .set("x-user-id", DEV_USER)
      .send({});
    expect(ended.status).toBe(200);
    expect(ended.body.context.endedReason).toBe("USER_ENDED");
    expect(getOpen()?.endedAt).not.toBeNull();

    const current = await request(createApp())
      .get("/api/work-contexts/current")
      .set("x-user-id", DEV_USER);
    expect(current.status).toBe(200);
    expect(current.body).toBeNull();
  });
});

describe("attribution corrections API (R1/R2)", () => {
  it("creates a TASK correction with a server-side title snapshot", async () => {
    const { db, created } = correctionsDb();
    setTestDb(db);
    const res = await request(createApp())
      .post("/api/attribution-corrections")
      .set("x-user-id", DEV_USER)
      .send({
        windowStart: "2026-10-18T09:00:00.000Z",
        windowEnd: "2026-10-18T10:00:00.000Z",
        targetKind: "TASK",
        taskId: "task-1",
        reason: "Pomodoro drift",
      });
    expect(res.status).toBe(201);
    expect(res.body.taskTitleSnapshot).toBe("Trace the useQuery lifecycle");
    expect(created[0]?.targetKind).toBe("TASK");
  });

  it("creates a NONE correction with no task reference", async () => {
    const { db, created } = correctionsDb();
    setTestDb(db);
    const res = await request(createApp())
      .post("/api/attribution-corrections")
      .set("x-user-id", DEV_USER)
      .send({
        windowStart: "2026-10-18T09:00:00.000Z",
        windowEnd: "2026-10-18T10:00:00.000Z",
        targetKind: "NONE",
      });
    expect(res.status).toBe(201);
    expect(created[0]?.taskId).toBeNull();
  });

  it("rejects a window that does not advance with 400", async () => {
    setTestDb(correctionsDb().db);
    const res = await request(createApp())
      .post("/api/attribution-corrections")
      .set("x-user-id", DEV_USER)
      .send({
        windowStart: "2026-10-18T10:00:00.000Z",
        windowEnd: "2026-10-18T09:00:00.000Z",
        targetKind: "NONE",
      });
    expect(res.status).toBe(400);
  });

  it("lists corrections for a window", async () => {
    const { db } = correctionsDb();
    setTestDb(db);
    await request(createApp())
      .post("/api/attribution-corrections")
      .set("x-user-id", DEV_USER)
      .send({
        windowStart: "2026-10-18T09:00:00.000Z",
        windowEnd: "2026-10-18T10:00:00.000Z",
        targetKind: "NONE",
      });
    const res = await request(createApp())
      .get("/api/attribution-corrections")
      .set("x-user-id", DEV_USER);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].targetKind).toBe("NONE");
  });
});
