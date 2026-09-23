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

describe("Timeline Part A: Telemetry Ingestion, Revisions & Concurrent Duplicates", () => {
  it("Scenario 6: Telemetry insert in user timezone advances correct local day observation revision", async () => {
    const upsertedDayStates: any[] = [];
    const createdOutboxEvents: any[] = [];

    const mockDb: any = {
      userPreference: {
        findUnique: vi.fn().mockResolvedValue({ timezone: "Asia/Kolkata" }),
      },
      normalizedActivity: {
        findMany: vi.fn().mockResolvedValue([]),
        createManyAndReturn: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve(
            data.map((item: any, idx: number) => ({
              id: `act_${idx}`,
              externalId: item.externalId,
              timestamp: item.timestamp,
              duration: item.duration,
            }))
          )
        ),
      },
      timelineDayState: {
        upsert: vi.fn().mockImplementation(({ where }) => {
          const state = {
            userId: DEV_USER,
            localDate: where.userId_localDate.localDate,
            currentObservationRevision: 1,
            currentRuleRevision: 0,
            status: "STALE",
          };
          upsertedDayStates.push(state);
          return Promise.resolve(state);
        }),
      },
      outboxEvent: {
        create: vi.fn().mockImplementation(({ data }) => {
          createdOutboxEvents.push(data);
          return Promise.resolve({ id: "outbox_001", ...data });
        }),
      },
      $transaction: vi.fn().mockImplementation(async (callback: any) => callback(mockDb)),
    };

    setTestDb(mockDb);

    // 2026-09-23 02:00:00 AM in Asia/Kolkata (+05:30) is 2026-09-22 20:30:00Z in UTC
    const res = await request(createApp())
      .post("/api/telemetry/batch")
      .set("x-user-id", DEV_USER)
      .send({
        installationId: "inst_001",
        source: "desktop",
        sentAt: "2026-09-22T20:31:00.000Z",
        events: [
          {
            eventId: "ev_001",
            installationId: "inst_001",
            source: "desktop",
            eventType: "active_window",
            timestamp: "2026-09-22T20:30:00.000Z",
            durationMs: 60000,
            data: { application: "Code", windowTitle: "telemetry.ts" },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
    expect(res.body.duplicates).toBe(0);

    // In Asia/Kolkata, 20:30:00Z on Sep 22 is 02:00:00 AM on Sep 23
    expect(upsertedDayStates).toHaveLength(1);
    expect(upsertedDayStates[0].localDate).toBe("2026-09-23");

    expect(createdOutboxEvents).toHaveLength(1);
    expect(createdOutboxEvents[0].eventType).toBe("telemetry.ingested");
    expect(createdOutboxEvents[0].payload.localDate).toBe("2026-09-23");
  });

  it("Scenario 7: Pure duplicate batch (actual mutations = 0) does NOT advance revision or emit outbox event", async () => {
    const upsertDayStateMock = vi.fn();
    const createOutboxMock = vi.fn();

    const mockDb: any = {
      userPreference: {
        findUnique: vi.fn().mockResolvedValue({ timezone: "UTC" }),
      },
      normalizedActivity: {
        findMany: vi.fn().mockResolvedValue([]),
        // Concurrent race: createManyAndReturn returns 0 rows because another request already inserted them
        createManyAndReturn: vi.fn().mockResolvedValue([]),
      },
      timelineDayState: {
        upsert: upsertDayStateMock,
      },
      outboxEvent: {
        create: createOutboxMock,
      },
      $transaction: vi.fn().mockImplementation(async (callback: any) => callback(mockDb)),
    };

    setTestDb(mockDb);

    const res = await request(createApp())
      .post("/api/telemetry/batch")
      .set("x-user-id", DEV_USER)
      .send({
        installationId: "inst_001",
        source: "desktop",
        sentAt: "2026-09-23T10:01:00.000Z",
        events: [
          {
            eventId: "dup_001",
            installationId: "inst_001",
            source: "desktop",
            eventType: "active_window",
            timestamp: "2026-09-23T10:00:00.000Z",
            durationMs: 60000,
            data: { application: "Code", windowTitle: "telemetry.ts" },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(0);
    expect(res.body.duplicates).toBe(1);

    // Actual-mutation rule: No revision advancement and no outbox events!
    expect(upsertDayStateMock).not.toHaveBeenCalled();
    expect(createOutboxMock).not.toHaveBeenCalled();
  });

  it("Scenario 8: Mixed batch advances revisions only for actually inserted rows", async () => {
    const upsertedDayStates: any[] = [];
    const createdOutboxEvents: any[] = [];

    const mockDb: any = {
      userPreference: {
        findUnique: vi.fn().mockResolvedValue({ timezone: "UTC" }),
      },
      normalizedActivity: {
        findMany: vi.fn().mockResolvedValue([]),
        // 1 duplicate skipped by DB constraint, 1 successfully inserted
        createManyAndReturn: vi.fn().mockResolvedValue([
          {
            id: "act_new",
            externalId: "new_001",
            timestamp: new Date("2026-09-23T12:00:00.000Z"),
            duration: 30,
          },
        ]),
      },
      timelineDayState: {
        upsert: vi.fn().mockImplementation(({ where }) => {
          const state = {
            userId: DEV_USER,
            localDate: where.userId_localDate.localDate,
            currentObservationRevision: 2,
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
      .post("/api/telemetry/batch")
      .set("x-user-id", DEV_USER)
      .send({
        installationId: "inst_001",
        source: "desktop",
        sentAt: "2026-09-23T12:01:00.000Z",
        events: [
          {
            eventId: "dup_already_in_db",
            installationId: "inst_001",
            source: "desktop",
            eventType: "active_window",
            timestamp: "2026-09-21T10:00:00.000Z",
            durationMs: 30000,
            data: { application: "Code", windowTitle: "old.ts" },
          },
          {
            eventId: "new_001",
            installationId: "inst_001",
            source: "desktop",
            eventType: "active_window",
            timestamp: "2026-09-23T12:00:00.000Z",
            durationMs: 30000,
            data: { application: "Code", windowTitle: "new.ts" },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
    expect(res.body.duplicates).toBe(1);

    // Only 2026-09-23 was inserted! 2026-09-21 was skipped by PostgreSQL and must NOT have its revision bumped.
    expect(upsertedDayStates).toHaveLength(1);
    expect(upsertedDayStates[0].localDate).toBe("2026-09-23");
    expect(createdOutboxEvents).toHaveLength(1);
    expect(createdOutboxEvents[0].payload.localDate).toBe("2026-09-23");
  });

  it("Scenario 9: Duration updates use original observation timestamp, not current time", async () => {
    const historicalObservationTime = new Date("2026-09-10T14:00:00.000Z");
    const upsertedDayStates: any[] = [];

    const mockDb: any = {
      userPreference: {
        findUnique: vi.fn().mockResolvedValue({ timezone: "UTC" }),
      },
      normalizedActivity: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "act_past",
            externalId: "past_001",
            duration: 10,
            timestamp: historicalObservationTime,
          },
        ]),
        update: vi.fn().mockResolvedValue({ id: "act_past" }),
      },
      timelineDayState: {
        upsert: vi.fn().mockImplementation(({ where }) => {
          const state = {
            userId: DEV_USER,
            localDate: where.userId_localDate.localDate,
            currentObservationRevision: 3,
          };
          upsertedDayStates.push(state);
          return Promise.resolve(state);
        }),
      },
      outboxEvent: {
        create: vi.fn().mockResolvedValue({ id: "outbox_001" }),
      },
      $transaction: vi.fn().mockImplementation(async (callback: any) => callback(mockDb)),
    };

    setTestDb(mockDb);

    const res = await request(createApp())
      .post("/api/telemetry/batch")
      .set("x-user-id", DEV_USER)
      .send({
        installationId: "inst_001",
        source: "desktop",
        sentAt: "2026-09-23T10:00:00.000Z", // Request sent today!
        events: [
          {
            eventId: "past_001",
            installationId: "inst_001",
            source: "desktop",
            eventType: "active_window",
            timestamp: "2026-09-10T14:00:00.000Z", // Historical observation timestamp
            durationMs: 60000, // Duration expanded from 10s to 60s
            data: { application: "Code", windowTitle: "past.ts" },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);

    // Revision must be bumped for the historical day 2026-09-10, NOT today's date!
    expect(upsertedDayStates).toHaveLength(1);
    expect(upsertedDayStates[0].localDate).toBe("2026-09-10");
  });

  it("Scenario 4 & 5 (Half-open intervals): End at 00:00:00 touches 1 day; end at 00:00:01 touches 2 days", async () => {
    // Part A: Event ends exactly at 00:00:00
    const upsertedDayStates1: any[] = [];
    const mockDb1: any = {
      userPreference: {
        findUnique: vi.fn().mockResolvedValue({ timezone: "UTC" }),
      },
      normalizedActivity: {
        findMany: vi.fn().mockResolvedValue([]),
        createManyAndReturn: vi.fn().mockResolvedValue([
          {
            id: "act_exact_midnight",
            externalId: "mid_001",
            timestamp: new Date("2026-09-23T23:59:30.000Z"),
            duration: 30, // 23:59:30 + 30s = 2026-09-24T00:00:00.000Z
          },
        ]),
      },
      timelineDayState: {
        upsert: vi.fn().mockImplementation(({ where }) => {
          upsertedDayStates1.push(where.userId_localDate.localDate);
          return Promise.resolve({ currentObservationRevision: 1 });
        }),
      },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockImplementation(async (callback: any) => callback(mockDb1)),
    };

    setTestDb(mockDb1);

    const res1 = await request(createApp())
      .post("/api/telemetry/batch")
      .set("x-user-id", DEV_USER)
      .send({
        installationId: "inst_001",
        source: "desktop",
        sentAt: "2026-09-24T00:00:01.000Z",
        events: [
          {
            eventId: "mid_001",
            installationId: "inst_001",
            source: "desktop",
            eventType: "active_window",
            timestamp: "2026-09-23T23:59:30.000Z",
            durationMs: 30000,
            data: { application: "Code", windowTitle: "midnight.ts" },
          },
        ],
      });

    expect(res1.status).toBe(200);
    expect(upsertedDayStates1).toEqual(["2026-09-23"]);

    // Part B: Event ends at 00:00:01 (crosses midnight)
    const upsertedDayStates2: any[] = [];
    const mockDb2: any = {
      userPreference: {
        findUnique: vi.fn().mockResolvedValue({ timezone: "UTC" }),
      },
      normalizedActivity: {
        findMany: vi.fn().mockResolvedValue([]),
        createManyAndReturn: vi.fn().mockResolvedValue([
          {
            id: "act_cross_midnight",
            externalId: "mid_002",
            timestamp: new Date("2026-09-23T23:59:30.000Z"),
            duration: 31, // 23:59:30 + 31s = 2026-09-24T00:00:01.000Z
          },
        ]),
      },
      timelineDayState: {
        upsert: vi.fn().mockImplementation(({ where }) => {
          upsertedDayStates2.push(where.userId_localDate.localDate);
          return Promise.resolve({ currentObservationRevision: 1 });
        }),
      },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockImplementation(async (callback: any) => callback(mockDb2)),
    };

    setTestDb(mockDb2);

    const res2 = await request(createApp())
      .post("/api/telemetry/batch")
      .set("x-user-id", DEV_USER)
      .send({
        installationId: "inst_001",
        source: "desktop",
        sentAt: "2026-09-24T00:00:02.000Z",
        events: [
          {
            eventId: "mid_002",
            installationId: "inst_001",
            source: "desktop",
            eventType: "active_window",
            timestamp: "2026-09-23T23:59:30.000Z",
            durationMs: 31000,
            data: { application: "Code", windowTitle: "crossing.ts" },
          },
        ],
      });

    expect(res2.status).toBe(200);
    expect(upsertedDayStates2).toEqual(["2026-09-23", "2026-09-24"]);
  });
});
