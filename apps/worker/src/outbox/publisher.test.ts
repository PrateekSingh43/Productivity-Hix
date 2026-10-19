import { afterEach, describe, it, expect, vi } from "vitest";
import { OutboxPublisher, isInfrastructureError, resolveHandlerForEvent } from "./publisher";

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

function fakeWorker(behavior: (payload: unknown) => Promise<unknown>) {
  return {
    run: async (payload: unknown, _opts: unknown) => {
      await behavior(payload);
      return { status: "SUCCEEDED" };
    },
  };
}

describe("resolveHandlerForEvent", () => {
  it("routes telemetry/rule/gap events to timeline", () => {
    for (const t of ["telemetry.ingested", "rule.changed", "override.changed", "gap.explained"]) {
      expect(resolveHandlerForEvent(t)).toBe("timeline");
    }
  });

  it("routes pattern requests to pattern", () => {
    expect(resolveHandlerForEvent("pattern.analysis.requested")).toBe("pattern");
  });

  it("returns undefined for unknown types", () => {
    expect(resolveHandlerForEvent("nope.unknown")).toBeUndefined();
  });
});

describe("isInfrastructureError", () => {
  it("classifies quota / connection / pool failures as infra", () => {
    expect(
      isInfrastructureError(new Error("ERR max requests limit exceeded. Limit: 5, Usage: 6"))
    ).toBe(true);
    expect(isInfrastructureError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe(true);
    expect(isInfrastructureError(new Error("Connection is closed"))).toBe(true);
    expect(
      isInfrastructureError(
        new Error("(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15")
      )
    ).toBe(true);
  });

  it("does not classify payload errors as infra", () => {
    expect(isInfrastructureError(new Error("invalid job payload"))).toBe(false);
    expect(isInfrastructureError(undefined)).toBe(false);
  });
});

describe("dispatchEvent direct execution", () => {
  it("parks worker infra throws as PENDING without consuming attempts", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const db = makeDb(async (args: unknown) => {
      const { where, data } = args as { where: unknown; data: Record<string, unknown> };
      updates.push({ where, data });
      return {};
    });
    const publisher = new OutboxPublisher({
      db: db as never,
      patternWorker: fakeWorker(async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
      }) as never,
      metrics: noopMetrics as never,
    });

    const ok = await publisher.dispatchEvent(makeEvent());

    expect(ok).toBe(false);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.data.status).toBe("PENDING");
    expect(updates[0]!.data).not.toHaveProperty("publicationAttemptCount");
    expect(String(updates[0]!.data.lastError)).toContain("[infra]");
  });

  it("still counts payload errors against attempts", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const db = makeDb(async (args: unknown) => {
      const { where, data } = args as { where: unknown; data: Record<string, unknown> };
      updates.push({ where, data });
      return {};
    });
    const publisher = new OutboxPublisher({
      db: db as never,
      patternWorker: fakeWorker(async () => {
        throw new Error("invalid job payload: missing userId");
      }) as never,
      metrics: noopMetrics as never,
    });

    await publisher.dispatchEvent(makeEvent());

    expect(updates).toHaveLength(1);
    expect(updates[0]!.data.status).toBe("PENDING");
    expect(updates[0]!.data.publicationAttemptCount).toBe(1);
  });

  it("marks executed timeline events PUBLISHED", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const db = makeDb(async (args: unknown) => {
      const { where, data } = args as { where: unknown; data: Record<string, unknown> };
      updates.push({ where, data });
      return {};
    });
    const seen: unknown[] = [];
    const publisher = new OutboxPublisher({
      db: db as never,
      timelineWorker: fakeWorker(async (payload) => {
        seen.push(payload);
      }) as never,
      metrics: noopMetrics as never,
    });

    const ok = await publisher.dispatchEvent(makeEvent({ eventType: "telemetry.ingested" }));

    expect(ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.data.status).toBe("PUBLISHED");
  });

  it("dead-letters unknown event types", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const db = makeDb(async (args: unknown) => {
      const { where, data } = args as { where: unknown; data: Record<string, unknown> };
      updates.push({ where, data });
      return {};
    });
    const publisher = new OutboxPublisher({
      db: db as never,
      metrics: noopMetrics as never,
    });

    const ok = await publisher.dispatchEvent(makeEvent({ eventType: "nope.unknown" }));

    expect(ok).toBe(false);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.data.status).toBe("DEAD_LETTER");
  });
});

describe("dispatchTimelineWork (coalesced, direct)", () => {
  function makeWorkDb(
    row: Record<string, unknown>,
    updates: Array<{ where: unknown; data: Record<string, unknown> }>,
    claimCount = 1
  ) {
    return {
      timelineWork: {
        findMany: async () => [row],
        updateMany: async (args: unknown) => {
          const { where, data } = args as { where: unknown; data: Record<string, unknown> };
          updates.push({ where, data });
          return { count: claimCount };
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

  function makePublisher(
    db: unknown,
    executor: (payload: unknown, opts: { jobId: string; correlationId: string; attempt: number; maxAttempts: number }) => Promise<{ status: string }>
  ) {
    return new OutboxPublisher({
      db: db as never,
      metrics: noopMetrics as never,
      directExecutor: executor,
    });
  }

  it("coalesces many ticks into one work execution carrying the latest revisions", async () => {
    // Regression shape: N ticks revive the SAME (user, day) row,
    // so the dispatcher executes once per row no matter how many batches landed.
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const db = makeWorkDb(workRow(), updates);
    const seen: Array<{ payload: unknown; opts: unknown }> = [];
    const publisher = makePublisher(db, async (payload, opts) => {
      seen.push({ payload, opts });
      return { status: "SUCCEEDED" };
    });

    const done = await publisher.dispatchTimelineWork();

    expect(done).toBe(1);
    expect(seen).toHaveLength(1);
    const sent = seen[0]!.payload as Record<string, unknown>;
    expect(sent?.requestedRevision).toEqual({
      observationRevision: 42,
      ruleRevision: 0,
      semanticVersion: "3b.0.1",
    });
    const final = updates[updates.length - 1]!;
    expect(final.data.status).toBe("COMPLETED");
  });

  it("treats SUPERSEDED as terminal COMPLETED", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const publisher = makePublisher(makeWorkDb(workRow(), updates), async () => ({ status: "SUPERSEDED" }));

    expect(await publisher.dispatchTimelineWork()).toBe(1);
    expect(updates[updates.length - 1]!.data.status).toBe("COMPLETED");
  });

  it("skips rows lost in a claim race", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    let calls = 0;
    const publisher = makePublisher(makeWorkDb(workRow(), updates, 0), async () => {
      calls++;
      return { status: "SUCCEEDED" };
    });

    expect(await publisher.dispatchTimelineWork()).toBe(0);
    expect(calls).toBe(0);
  });

  it("parks infra failures without consuming attempts", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const publisher = makePublisher(makeWorkDb(workRow(), updates), async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    });

    expect(await publisher.dispatchTimelineWork()).toBe(0);
    const final = updates[updates.length - 1]!;
    expect(final.data.status).toBe("PENDING");
    expect(final.data).not.toHaveProperty("attempts");
    expect(String(final.data.lastError)).toContain("[infra]");
  });

  it("counts poison failures and dead-letters at cap", async () => {
    const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
    const publisher = makePublisher(makeWorkDb(workRow({ attempts: 4 }), updates), async () => {
      throw new Error("invalid job payload: missing userId");
    });

    expect(await publisher.dispatchTimelineWork()).toBe(0);
    const final = updates[updates.length - 1]!;
    expect(final.data.status).toBe("DEAD_LETTER");
    expect(final.data.attempts).toBe(5);
  });
});

describe("retention sweep", () => {
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
