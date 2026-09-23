import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { setTestDb, resetTestDb } from "../lib/prisma";

const DEV_USER = "cuid_dev_user_001";

beforeEach(() => {
  vi.stubEnv("ALLOW_DEV_AUTH", "true");
});

afterEach(() => {
  resetTestDb();
  vi.unstubAllEnvs();
});

describe("Timeline Part A: Rule Effective Scope & Non-Destructive Invalidation", () => {
  it("Scenario 12 & 13: Global rule creation marks bounded retention window STALE and emits rule.changed events", async () => {
    const upsertedDayStates: any[] = [];
    const createdOutboxEvents: any[] = [];

    const mockDb: any = {
      userPreference: {
        findUnique: vi.fn().mockResolvedValue({ timezone: "UTC" }),
      },
      userActivityRule: {
        create: vi.fn().mockResolvedValue({ id: "rule_1", name: "Focus Rule" }),
      },
      temporalActivityBlock: {
        deleteMany: vi.fn(), // Invariant: Must NOT be called!
      },
      timelineDayState: {
        upsert: vi.fn().mockImplementation(({ where }) => {
          const state = {
            userId: DEV_USER,
            localDate: where.userId_localDate.localDate,
            currentRuleRevision: 1,
            status: "STALE",
          };
          upsertedDayStates.push(state);
          return Promise.resolve(state);
        }),
      },
      outboxEvent: {
        create: vi.fn().mockImplementation(({ data }) => {
          createdOutboxEvents.push(data);
          return Promise.resolve(data);
        }),
      },
      $transaction: vi.fn().mockImplementation(async (callback: any) => callback(mockDb)),
    };

    setTestDb(mockDb);

    const res = await request(createApp())
      .post("/api/activity-rules/rules")
      .set("x-user-id", DEV_USER)
      .send({
        name: "Test Rule",
        priority: 10,
        isEnabled: true,
        applicationPattern: "Code",
        assignedModality: "development",
      });

    expect(res.status).toBe(201);

    // Rule Effective Scope (bounded_retention 14 days default):
    // Exactly 14 days are marked STALE
    expect(upsertedDayStates).toHaveLength(14);
    for (const state of upsertedDayStates) {
      expect(state.status).toBe("STALE");
    }

    // 14 outbox events emitted
    expect(createdOutboxEvents).toHaveLength(14);
    for (const ev of createdOutboxEvents) {
      expect(ev.eventType).toBe("rule.changed");
      expect(ev.payload.reason).toBe("rule_changed");
    }

    // Invariant: Non-destructive! No TemporalActivityBlock rows are deleted synchronously
    expect(mockDb.temporalActivityBlock.deleteMany).not.toHaveBeenCalled();
  });

  it("Scenario 14: Targeted override resolves affected dates and scopes in user timezone", async () => {
    const upsertedDayStates: any[] = [];
    const createdOutboxEvents: any[] = [];

    const mockDb: any = {
      userPreference: {
        findUnique: vi.fn().mockResolvedValue({ timezone: "Asia/Kolkata" }),
      },
      userActivityOverride: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "ovr_1", ...data })),
      },
      timelineDayState: {
        upsert: vi.fn().mockImplementation(({ where }) => {
          const state = {
            userId: DEV_USER,
            localDate: where.userId_localDate.localDate,
            currentRuleRevision: 2,
            status: "STALE",
          };
          upsertedDayStates.push(state);
          return Promise.resolve(state);
        }),
      },
      outboxEvent: {
        create: vi.fn().mockImplementation(({ data }) => {
          createdOutboxEvents.push(data);
          return Promise.resolve(data);
        }),
      },
      $transaction: vi.fn().mockImplementation(async (callback: any) => callback(mockDb)),
    };

    setTestDb(mockDb);

    // An override in Asia/Kolkata (+05:30) spanning from 23:30 to 00:30 local time:
    // 2026-09-23 23:30:00 (+05:30) -> 2026-09-23T18:00:00.000Z
    // 2026-09-24 00:30:00 (+05:30) -> 2026-09-23T19:00:00.000Z
    const res = await request(createApp())
      .post("/api/activity-rules/overrides")
      .set("x-user-id", DEV_USER)
      .send({
        targetTimeWindowStart: "2026-09-23T18:00:00.000Z",
        targetTimeWindowEnd: "2026-09-23T19:00:00.000Z",
        targetApplication: "YouTube",
        targetClaimFamily: "CLASSIFICATION",
        targetClaimType: "MODALITY_PRIMARY",
        overriddenValue: "reading_research",
        reason: "Studying course lecture",
      });

    expect(res.status).toBe(201);

    // It spans across midnight in Asia/Kolkata (from 23:30 on Sep 23 to 00:30 on Sep 24)
    // Touches both 2026-09-23 and 2026-09-24!
    expect(upsertedDayStates).toHaveLength(2);
    expect(upsertedDayStates.map((s) => s.localDate)).toEqual(["2026-09-23", "2026-09-24"]);

    expect(createdOutboxEvents).toHaveLength(2);
    expect(createdOutboxEvents[0].payload.localDate).toBe("2026-09-23");
    expect(createdOutboxEvents[1].payload.localDate).toBe("2026-09-24");
  });
});
