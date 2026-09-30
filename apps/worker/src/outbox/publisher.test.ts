import { afterEach, describe, it, expect, vi } from "vitest";
import { OutboxPublisher, isInfrastructureError } from "./publisher";

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeDb(updateSpy: (args: unknown) => Promise<unknown>) {
  return {
    outboxEvent: { update: updateSpy },
  };
}

const noopMetrics = {
  increment: () => {},
  timing: () => {},
  gauge: () => {},
};

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    eventType: "pattern.analysis.requested",
    aggregateType: "pattern",
    aggregateId: "user-1",
    payload: { userId: "user-1" },
    correlationId: "corr-1",
    causationId: null,
    schemaVersion: "1.0.0",
    occurredAt: new Date(),
    createdAt: new Date(),
    publicationAttemptCount: 0,
    maxAttempts: 5,
    ...overrides,
  } as never;
}

describe("isInfrastructureError", () => {
  it("classifies quota / connection failures as infra", () => {
    expect(
      isInfrastructureError(new Error("ERR max requests limit exceeded. Limit: 5, Usage: 6"))
    ).toBe(true);
    expect(isInfrastructureError(new Error("connect ECONNREFUSED 127.0.0.1:6379"))).toBe(true);
    expect(isInfrastructureError(new Error("Connection is closed"))).toBe(true);
  });

  it("does not classify payload errors as infra", () => {
    expect(isInfrastructureError(new Error("invalid job payload"))).toBe(false);
    expect(isInfrastructureError(undefined)).toBe(false);
  });
});

describe("dispatchEvent infra handling", () => {
  it("parks quota failures as PENDING without consuming attempts", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const db = makeDb(async (args: unknown) => {
      const { where, data } = args as { where: unknown; data: Record<string, unknown> };
      updates.push({ where, data });
      return {};
    });
    const queueManager = {
      addJob: async () => {
        throw new Error("ERR max requests limit exceeded. Limit: 5, Usage: 6");
      },
    };
    const publisher = new OutboxPublisher({
      db: db as never,
      queueManager: queueManager as never,
      metrics: noopMetrics as never,
    });

    const ok = await publisher.dispatchEvent(makeEvent());

    expect(ok).toBe(false);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.data.status).toBe("PENDING");
    expect(updates[0]!.data).not.toHaveProperty("publicationAttemptCount");
    expect(String(updates[0]!.data.lastError)).toContain("[infra]");
  });

  it("coalesces many ticks into one work row only at ingest (dispatcher executes once per row)", async () => {
    // Regression shape for Phase 2: N ticks revive the SAME (user, day) row,
    // so the dispatcher sees one PENDING row no matter how many batches landed.
    const seenJobIds: string[] = [];
    const db = {
      timelineWork: {
        findMany: async () => [
          {
            id: "work-1",
            userId: "u",
            localDate: "2026-09-30",
            status: "PENDING",
            requestedObservationRevision: 42,
            requestedRuleRevision: 0,
            attempts: 0,
            maxAttempts: 5,
          },
        ],
        updateMany: async () => ({ count: 1 }),
        update: async () => ({}),
      },
      outboxEvent: { update: async () => ({}), updateMany: async () => ({ count: 0 }) },
    };
    const queueManager = {
      addJob: async (_q: string, _n: string, _d: unknown, opts: { jobId: string }) => {
        seenJobIds.push(opts.jobId);
        return opts.jobId;
      },
    };
    const publisher = new OutboxPublisher({
      db: db as never,
      queueManager: queueManager as never,
      metrics: noopMetrics as never,
    });

    const done = await publisher.dispatchTimelineWork();

    expect(done).toBe(1);
    expect(seenJobIds).toHaveLength(1);
  });

  it("still counts payload errors against attempts", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const db = makeDb(async (args: unknown) => {
      const { where, data } = args as { where: unknown; data: Record<string, unknown> };
      updates.push({ where, data });
      return {};
    });
    const queueManager = {
      addJob: async () => {
        throw new Error("invalid job payload: missing userId");
      },
    };
    const publisher = new OutboxPublisher({
      db: db as never,
      queueManager: queueManager as never,
      metrics: noopMetrics as never,
    });

    await publisher.dispatchEvent(makeEvent());

    expect(updates).toHaveLength(1);
    expect(updates[0]!.data.status).toBe("PENDING");
    expect(updates[0]!.data.publicationAttemptCount).toBe(1);
  });
});

describe("dispatchTimelineWork (Phase 2)", () => {
  function makeWorkDb(
    row: Record<string, unknown>,
    behavior: { addJob?: (opts: { jobId: string }) => Promise<string>; claimCount?: number },
    updates: Array<{ where: unknown; data: Record<string, unknown> }>
  ) {
    return {
      timelineWork: {
        findMany: async () => [row],
        updateMany: async (args: unknown) => {
          const { where, data } = args as { where: unknown; data: Record<string, unknown> };
          updates.push({ where, data });
          return { count: behavior.claimCount ?? 1 };
        },
        update: async (args: unknown) => {
          const { where, data } = args as { where: unknown; data: Record<string, unknown> };
          updates.push({ where, data });
          return {};
        },
      },
      outboxEvent: { update: async () => ({}), updateMany: async () => ({ count: 0 }) },
    };
  }

  const workRow = (overrides: Record<string, unknown> = {}) => ({
    id: "work-1",
    userId: "u",
    localDate: "2026-09-30",
    status: "PENDING",
    requestedObservationRevision: 42,
    requestedRuleRevision: 0,
    attempts: 0,
    maxAttempts: 5,
    ...overrides,
  });

  function makePublisher(db: unknown, addJob: (opts: { jobId: string }) => Promise<string>) {
    return new OutboxPublisher({
      db: db as never,
      queueManager: { addJob: async (_q: string, _n: string, _d: unknown, opts: { jobId: string }) => addJob(opts) } as never,
      metrics: noopMetrics as never,
    });
  }

  it("dispatches the row's latest revisions and marks COMPLETED", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const db = makeWorkDb(workRow(), {}, updates);
    let enqueued: Record<string, unknown> | null = null;
    const seenJobIds: string[] = [];
    const publisher = new OutboxPublisher({
      db: db as never,
      queueManager: {
        addJob: async (_q: string, _n: string, data: unknown, opts: { jobId: string }) => {
          enqueued = data as Record<string, unknown>;
          seenJobIds.push(opts.jobId);
          return opts.jobId;
        },
      } as never,
      metrics: noopMetrics as never,
    });

    const done = await publisher.dispatchTimelineWork();

    expect(done).toBe(1);
    expect(seenJobIds).toHaveLength(1);
    const sent = enqueued as Record<string, unknown> | null;
    expect(sent?.requestedRevision).toEqual({
      observationRevision: 42,
      ruleRevision: 0,
      semanticVersion: "3b.0.1",
    });
    const final = updates[updates.length - 1]!;
    expect(final.data.status).toBe("COMPLETED");
  });

  it("skips rows lost in a claim race", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const db = makeWorkDb(workRow(), { claimCount: 0 }, updates);
    let calls = 0;
    const publisher = makePublisher(db, async (opts) => {
      calls++;
      return opts.jobId;
    });

    expect(await publisher.dispatchTimelineWork()).toBe(0);
    expect(calls).toBe(0);
  });

  it("parks infra failures without consuming attempts", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const db = makeWorkDb(workRow(), {}, updates);
    const publisher = makePublisher(db, async () => {
      throw new Error("ERR max requests limit exceeded. Limit: 5, Usage: 6");
    });

    expect(await publisher.dispatchTimelineWork()).toBe(0);
    const final = updates[updates.length - 1]!;
    expect(final.data.status).toBe("PENDING");
    expect(final.data).not.toHaveProperty("attempts");
    expect(String(final.data.lastError)).toContain("[infra]");
  });

  it("counts poison failures and dead-letters at cap", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const db = makeWorkDb(workRow({ attempts: 4 }), {}, updates);
    const publisher = makePublisher(db, async () => {
      throw new Error("invalid job payload: missing userId");
    });

    expect(await publisher.dispatchTimelineWork()).toBe(0);
    const final = updates[updates.length - 1]!;
    expect(final.data.status).toBe("DEAD_LETTER");
    expect(final.data.attempts).toBe(5);
  });
});

describe("retention sweep (Phase 4)", () => {
  function retentionDb(calls: string[]) {
    return {
      outboxEvent: {
        update: async () => ({}),
        updateMany: async () => ({ count: 0 }),
        deleteMany: async () => {
          calls.push("outbox");
          return { count: 3 };
        },
      },
      timelineWork: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
        update: async () => ({}),
        deleteMany: async () => {
          calls.push("work");
          return { count: 1 };
        },
      },
      $queryRaw: async () => {
        calls.push("snapshots");
        return [];
      },
    };
  }

  function retentionPublisher(db: unknown, opts: Record<string, unknown> = {}) {
    return new OutboxPublisher({
      db: db as never,
      queueManager: { addJob: async () => "job-1" } as never,
      metrics: noopMetrics as never,
      cleanupIntervalMs: 60_000,
      ...opts,
    } as never);
  }

  it("prunes terminal rows and expired snapshots, then skips within cadence", async () => {
    const calls: string[] = [];
    const publisher = retentionPublisher(retentionDb(calls));

    await publisher.runRetentionCleanup(new Date("2026-09-30T00:00:00Z"));
    expect(calls).toEqual(["outbox", "work", "snapshots"]);

    // Second call inside the cadence window is a no-op.
    await publisher.runRetentionCleanup(new Date("2026-09-30T00:00:30Z"));
    expect(calls).toEqual(["outbox", "work", "snapshots"]);
  });

  it("is disabled when cleanupIntervalMs is 0", async () => {
    const calls: string[] = [];
    const publisher = retentionPublisher(retentionDb(calls), { cleanupIntervalMs: 0 });

    await publisher.runRetentionCleanup();
    expect(calls).toEqual([]);
  });

  it("skips models the client does not have", async () => {
    const calls: string[] = [];
    const db = {
      outboxEvent: {
        update: async () => ({}),
        updateMany: async () => ({ count: 0 }),
        deleteMany: async () => {
          calls.push("outbox");
          return { count: 0 };
        },
      },
    };
    const publisher = retentionPublisher(db);

    await publisher.runRetentionCleanup();
    expect(calls).toEqual(["outbox"]);
  });
});

describe("direct dispatch (Phase 3, TIMELINE_DIRECT_DISPATCH=true)", () => {
  function makeDirectPublisher(
    db: unknown,
    executor: (payload: unknown, opts: { jobId: string; correlationId: string; attempt: number; maxAttempts: number }) => Promise<{ status: string }>
  ) {
    return new OutboxPublisher({
      db: db as never,
      queueManager: {
        addJob: async () => {
          throw new Error("BullMQ path must not be used in direct mode");
        },
      } as never,
      metrics: noopMetrics as never,
      directExecutor: executor,
    });
  }

  function workDb(row: Record<string, unknown>, updates: Array<{ where: unknown; data: Record<string, unknown> }>) {
    return {
      timelineWork: {
        findMany: async () => [row],
        updateMany: async (args: unknown) => {
          const { where, data } = args as { where: unknown; data: Record<string, unknown> };
          updates.push({ where, data });
          return { count: 1 };
        },
        update: async (args: unknown) => {
          const { where, data } = args as { where: unknown; data: Record<string, unknown> };
          updates.push({ where, data });
          return {};
        },
      },
      outboxEvent: { update: async () => ({}), updateMany: async () => ({ count: 0 }) },
    };
  }

  const row = {
    id: "work-9",
    userId: "u",
    localDate: "2026-09-30",
    status: "PENDING",
    requestedObservationRevision: 11,
    requestedRuleRevision: 2,
    attempts: 0,
    maxAttempts: 5,
  };

  it("executes inline and marks COMPLETED without touching BullMQ", async () => {
    vi.stubEnv("TIMELINE_DIRECT_DISPATCH", "true");
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const seen: Array<{ payload: unknown; opts: unknown }> = [];
    const publisher = makeDirectPublisher(workDb(row, updates), async (payload, opts) => {
      seen.push({ payload, opts });
      return { status: "SUCCEEDED" };
    });

    expect(await publisher.dispatchTimelineWork()).toBe(1);
    expect(seen).toHaveLength(1);
    expect((seen[0]!.payload as Record<string, unknown>).requestedRevision).toEqual({
      observationRevision: 11,
      ruleRevision: 2,
      semanticVersion: "3b.0.1",
    });
    expect(updates[updates.length - 1]!.data.status).toBe("COMPLETED");
  });

  it("treats SUPERSEDED as terminal COMPLETED", async () => {
    vi.stubEnv("TIMELINE_DIRECT_DISPATCH", "true");
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const publisher = makeDirectPublisher(workDb(row, updates), async () => ({ status: "SUPERSEDED" }));

    expect(await publisher.dispatchTimelineWork()).toBe(1);
    expect(updates[updates.length - 1]!.data.status).toBe("COMPLETED");
  });

  it("parks executor infra throws without consuming attempts", async () => {
    vi.stubEnv("TIMELINE_DIRECT_DISPATCH", "true");
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const publisher = makeDirectPublisher(workDb(row, updates), async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    });

    expect(await publisher.dispatchTimelineWork()).toBe(0);
    const final = updates[updates.length - 1]!;
    expect(final.data.status).toBe("PENDING");
    expect(final.data).not.toHaveProperty("attempts");
  });

  it("queue path is used when the flag is off", async () => {
    vi.stubEnv("TIMELINE_DIRECT_DISPATCH", "false");
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    let enqueued = 0;
    const publisher = new OutboxPublisher({
      db: workDb(row, updates) as never,
      queueManager: {
        addJob: async () => {
          enqueued++;
          return "job-1";
        },
      } as never,
      metrics: noopMetrics as never,
      directExecutor: async () => {
        throw new Error("must not run");
      },
    });

    expect(await publisher.dispatchTimelineWork()).toBe(1);
    expect(enqueued).toBe(1);
  });
});
