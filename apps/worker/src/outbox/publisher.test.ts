import { describe, it, expect } from "vitest";
import { OutboxPublisher, isInfrastructureError } from "./publisher";

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
