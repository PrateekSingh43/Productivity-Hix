process.env.NODE_ENV = "test";

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { dailyAnalytics } from "./service";
import { setTestDb, resetTestDb } from "../../lib/prisma";
import {
  getDuckDB,
  closeDuckDB,
  rebuildDuckDBFromPostgres,
  ensureDuckDBSynchronized,
  isDuckDBSynchronized,
  assertDuckDBReady,
} from "../data/duckdb";
import { ingestTelemetryEvents } from "@repo/data";
import type { TelemetryEvent } from "@repo/telemetry";
import { handleTelemetryBatch } from "../../routes/telemetry";

describe("Daily Analytics Real Service Integration & Backward Compatibility", () => {
  afterEach(async () => {
    resetTestDb();
    await closeDuckDB();
  });

  it("directly tests the REAL dailyAnalytics() service function", async () => {
    const targetDate = "2026-09-13";
    const testUserId = "user-real-service-test";

    // Mock Prisma datastore for the real service call
    const mockEvents = [
      {
        id: "pg-act-1",
        userId: testUserId,
        externalId: "ev-real-1",
        bucketId: "b-1",
        source: "desktop",
        watcher: "active_window",
        timestamp: new Date("2026-09-13T10:00:00.000Z"),
        duration: 1800, // 30m
        data: { application: "Code.exe", windowTitle: "service.ts" },
      },
      {
        id: "pg-act-2",
        userId: testUserId,
        externalId: "ev-real-2",
        bucketId: "b-1",
        source: "desktop",
        watcher: "active_window",
        timestamp: new Date("2026-09-13T10:30:00.000Z"),
        duration: 1200, // 20m
        data: { application: "Chrome.exe", windowTitle: "GitHub PR" },
      },
    ];

    const mockTasks = [
      {
        id: "t-1",
        userId: testUserId,
        title: "Feature implementation",
        status: "done",
        createdAt: new Date("2026-09-13T09:00:00.000Z"),
        completedAt: new Date("2026-09-13T11:00:00.000Z"),
      },
      {
        id: "t-2",
        userId: testUserId,
        title: "Documentation",
        status: "todo",
        createdAt: new Date("2026-09-13T09:30:00.000Z"),
        completedAt: null,
      },
    ];

    const mockCheckIns = [
      {
        id: "chk-real-1",
        userId: testUserId,
        workSessionId: null,
        taskId: null,
        createdAt: new Date("2026-09-13T10:50:00.000Z"),
        windowStart: new Date("2026-09-13T10:00:00.000Z"),
        windowEnd: new Date("2026-09-13T10:50:00.000Z"),
        activityAssessment: "focused",
        alignment: "yes",
        reasons: ["deep work"],
        state: "focused",
        energy: "high",
        focus: "high",
        note: "great real service run",
        questionVersion: "v1",
        source: "extension_hourly",
        deeperAnswers: null,
        eventType: "PERIODIC",
        intent: "code review",
        progress: true,
        blocker: null,
        productive: true,
        outcome: "completed code review",
      },
    ];

    setTestDb({
      task: {
        findMany: async () => mockTasks,
      },
      checkIn: {
        findMany: async () => mockCheckIns,
      },
      normalizedActivity: {
        findMany: async () => mockEvents,
      },
    });

    // Invoke the REAL service function
    const result = await dailyAnalytics(testUserId, targetDate, "UTC");

    // 1. Authoritative canonical feature layer output
    assert.equal(result.date, "2026-09-13");
    assert.ok(result.features, "Authoritative canonical features object must be present");
    assert.equal(result.features.date, "2026-09-13");
    assert.equal(result.features.totalSessionCount, 1, "Nearby events merged into 1 continuous session");
    assert.equal(result.features.totalSessionDurationSeconds, 3000);
    assert.equal(result.features.completedTaskCount, 1);
    assert.equal(result.features.createdTaskCount, 2);
    assert.equal(result.features.taskCompletionRate, 0.5);
    assert.equal(result.features.checkInCount, 1);

    // 2. Backward compatibility outputs for UI consumers
    assert.equal(result.taskCompletionRate, result.features.taskCompletionRate);
    assert.equal(result.checkIns, result.features.checkInCount);
    assert.ok(result.activity, "Legacy activity summary must be present for legacy consumers");
    assert.ok(Array.isArray(result.patterns), "Legacy productivity patterns adapter must be an array");
  });
});

describe("DuckDB Analytical Projection Invariants & Resilience", () => {
  afterEach(async () => {
    resetTestDb();
    await closeDuckDB();
  });

  it("user-specific rebuild deletes old projection (true replacement, no stale phantoms)", async () => {
    const client = await getDuckDB();

    // Ingest initial state: User A has 3 events, User B has 2 events
    const initialEventsA: TelemetryEvent[] = [
      {
        eventId: "ea-1",
        source: "desktop",
        installationId: "inst-a",
        eventType: "active_window",
        timestamp: "2026-09-13T10:00:00.000Z",
        durationMs: 30000,
        data: { application: "Code.exe", windowTitle: "1.ts" },
      },
      {
        eventId: "ea-2",
        source: "desktop",
        installationId: "inst-a",
        eventType: "active_window",
        timestamp: "2026-09-13T10:01:00.000Z",
        durationMs: 30000,
        data: { application: "Code.exe", windowTitle: "2.ts" },
      },
      {
        eventId: "ea-3",
        source: "desktop",
        installationId: "inst-a",
        eventType: "active_window",
        timestamp: "2026-09-13T10:02:00.000Z",
        durationMs: 30000,
        data: { application: "Code.exe", windowTitle: "3.ts" },
      },
    ];

    const initialEventsB: TelemetryEvent[] = [
      {
        eventId: "eb-1",
        source: "browser",
        installationId: "inst-b",
        eventType: "active_tab",
        timestamp: "2026-09-13T10:00:00.000Z",
        durationMs: 20000,
        data: { domain: "github.com", sanitizedUrl: "https://github.com", pageTitle: "GitHub" },
      },
      {
        eventId: "eb-2",
        source: "browser",
        installationId: "inst-b",
        eventType: "active_tab",
        timestamp: "2026-09-13T10:01:00.000Z",
        durationMs: 20000,
        data: { domain: "linear.app", sanitizedUrl: "https://linear.app", pageTitle: "Linear" },
      },
    ];

    await ingestTelemetryEvents(client, "user-A", initialEventsA);
    await ingestTelemetryEvents(client, "user-B", initialEventsB);

    const conn = client.getConnection();
    const countARes1 = await conn.runAndReadAll(`SELECT COUNT(*) FROM telemetry_events WHERE user_id = 'user-A'`);
    assert.equal(Number(countARes1.getRows()[0]?.[0]), 3);

    // PostgreSQL source of truth now has ONLY 1 event for User A (ea-2 and ea-3 were pruned/deleted in PG)
    setTestDb({
      normalizedActivity: {
        findMany: async (args: { where?: { userId?: string } }) => {
          if (args.where?.userId === "user-A") {
            return [
              {
                id: "pg-a-1",
                userId: "user-A",
                externalId: "ea-1",
                bucketId: "inst-a",
                source: "desktop",
                watcher: "active_window",
                timestamp: new Date("2026-09-13T10:00:00.000Z"),
                duration: 30,
                data: { application: "Code.exe", windowTitle: "1.ts" },
              },
            ];
          }
          return [];
        },
      },
    });

    // Rebuild User A projection
    await rebuildDuckDBFromPostgres("user-A");

    // Invariant: DuckDB now contains EXACTLY 1 event for User A, no stale phantom rows!
    const countARes2 = await conn.runAndReadAll(`SELECT COUNT(*) FROM telemetry_events WHERE user_id = 'user-A'`);
    assert.equal(Number(countARes2.getRows()[0]?.[0]), 1);

    // Invariant: User B's 2 events were completely untouched
    const countBRes = await conn.runAndReadAll(`SELECT COUNT(*) FROM telemetry_events WHERE user_id = 'user-B'`);
    assert.equal(Number(countBRes.getRows()[0]?.[0]), 2);
  });

  it("conservative synchronization catches duration mismatch when count and max timestamp are equal", async () => {
    const client = await getDuckDB();

    // DuckDB has event with duration 30 seconds
    const event: TelemetryEvent = {
      eventId: "e-dur-test",
      source: "desktop",
      installationId: "inst-1",
      eventType: "active_window",
      timestamp: "2026-09-13T12:00:00.000Z",
      durationMs: 30000,
      data: { application: "Code.exe", windowTitle: "file.ts" },
    };
    await ingestTelemetryEvents(client, "user-sync", [event]);

    // In PostgreSQL:
    // Count is 1, max timestamp is 12:00:00 (identical to DuckDB!)
    // BUT duration was updated in PostgreSQL to 45 seconds (45 != 30)!
    let pgFindManyCalled = false;
    setTestDb({
      normalizedActivity: {
        aggregate: async () => ({
          _count: { id: 1 },
          _sum: { duration: 45.0 }, // 45 seconds in Postgres
          _max: { timestamp: new Date("2026-09-13T12:00:00.000Z") },
        }),
        findMany: async () => {
          pgFindManyCalled = true;
          return [
            {
              id: "pg-dur-1",
              userId: "user-sync",
              externalId: "e-dur-test",
              bucketId: "inst-1",
              source: "desktop",
              watcher: "active_window",
              timestamp: new Date("2026-09-13T12:00:00.000Z"),
              duration: 45.0,
              data: { application: "Code.exe", windowTitle: "file.ts" },
            },
          ];
        },
      },
    });

    // Run conservative synchronization
    await ensureDuckDBSynchronized();

    // Must trigger rebuild because duration sum differed (45s vs 30s)
    assert.equal(pgFindManyCalled, true, "Rebuild must be triggered when duration sum differs");

    const conn = client.getConnection();
    const durRes = await conn.runAndReadAll(
      `SELECT duration_ms FROM telemetry_events WHERE user_id = 'user-sync' AND event_id = 'e-dur-test'`
    );
    assert.equal(Number(durRes.getRows()[0]?.[0]), 45000);
    assert.equal(isDuckDBSynchronized(), true);
  });

  it("rebuild failure leaves isDuckDBSynchronized() false and subsequent rebuild recovers", async () => {
    // 1. Simulate PostgreSQL throwing an error during rebuild
    setTestDb({
      normalizedActivity: {
        findMany: async () => {
          throw new Error("PostgreSQL connection timeout during rebuild");
        },
      },
    });

    let failed = false;
    try {
      await rebuildDuckDBFromPostgres();
    } catch (err) {
      failed = true;
    }

    assert.equal(failed, true);
    // Invariant: DuckDB is NOT considered ready / synchronized
    assert.equal(isDuckDBSynchronized(), false);

    // 2. Recovery: PostgreSQL recovers and returns data
    setTestDb({
      normalizedActivity: {
        findMany: async () => [
          {
            id: "pg-recovered",
            userId: "user-rec",
            externalId: "e-rec",
            bucketId: "b-rec",
            source: "desktop",
            watcher: "active_window",
            timestamp: new Date("2026-09-13T14:00:00.000Z"),
            duration: 15,
            data: { application: "Terminal.exe", windowTitle: "bash" },
          },
        ],
        aggregate: async () => ({
          _count: { id: 1 },
          _sum: { duration: 15 },
          _max: { timestamp: new Date("2026-09-13T14:00:00.000Z") },
        }),
      },
    });

    // Rerun rebuild & sync
    await rebuildDuckDBFromPostgres();
    await ensureDuckDBSynchronized();

    // Invariant: System recovers and is marked synchronized
    assert.equal(isDuckDBSynchronized(), true);

    const client = await getDuckDB();
    const conn = client.getConnection();
    const countRes = await conn.runAndReadAll(`SELECT COUNT(*) FROM telemetry_events WHERE user_id = 'user-rec'`);
    assert.equal(Number(countRes.getRows()[0]?.[0]), 1);
  });

  it("BLOCKER 2 invariant: assertDuckDBReady() throws 503 while projection is unready or rebuilding", async () => {
    // 1. When not synchronized
    setTestDb({
      normalizedActivity: {
        findMany: async () => {
          throw new Error("Simulated failure during rebuild");
        },
      },
    });

    try {
      await rebuildDuckDBFromPostgres();
    } catch {
      // expected failure
    }

    assert.equal(isDuckDBSynchronized(), false);

    // Assert calling assertDuckDBReady throws DuckDBNotReadyError with statusCode 503
    let threw503 = false;
    try {
      assertDuckDBReady();
    } catch (err: any) {
      if (err.statusCode === 503) {
        threw503 = true;
      }
    }
    assert.equal(threw503, true, "assertDuckDBReady() must reject with HTTP 503 when unready");

    // 2. When synchronized
    setTestDb({
      normalizedActivity: {
        findMany: async () => [],
        aggregate: async () => ({
          _count: { id: 0 },
          _sum: { duration: 0 },
          _max: { timestamp: null },
        }),
      },
    });
    await ensureDuckDBSynchronized();
    assert.equal(isDuckDBSynchronized(), true);
    // Must not throw when synchronized
    assert.doesNotThrow(() => assertDuckDBReady());
  });

  it("Task 13 invariant: real handleTelemetryBatch route handler commits PostgreSQL even when DuckDB fails", async () => {
    const postgresSavedRows: any[] = [];

    setTestDb({
      normalizedActivity: {
        findMany: async () => [],
        createMany: async (args: { data: any[] }) => {
          postgresSavedRows.push(...args.data);
          return { count: args.data.length };
        },
        update: async () => ({}),
      },
    });

    // Close DuckDB so any projection attempt fails
    await closeDuckDB();

    const mockReq: any = {
      userId: "u-real-telemetry-user",
      body: {
        source: "desktop",
        installationId: "inst-test",
        sentAt: new Date().toISOString(),
        events: [
          {
            eventId: "real-batch-ev-1",
            source: "desktop",
            installationId: "inst-test",
            eventType: "active_window",
            timestamp: "2026-09-13T16:00:00.000Z",
            durationMs: 30000,
            data: { application: "Code.exe", windowTitle: "main.ts" },
          },
        ],
      },
    };

    let responseJson: any = null;
    let nextCalledWithError: any = null;

    const mockRes: any = {
      json: (data: any) => {
        responseJson = data;
        return mockRes;
      },
    };

    const mockNext = (err?: any) => {
      if (err) nextCalledWithError = err;
    };

    // Execute the REAL route handler from routes/telemetry.ts
    await handleTelemetryBatch(mockReq, mockRes, mockNext);

    // 1. PostgreSQL received and committed the event
    assert.equal(postgresSavedRows.length, 1);
    assert.equal(postgresSavedRows[0]?.externalId, "real-batch-ev-1");
    assert.equal(postgresSavedRows[0]?.userId, "u-real-telemetry-user");
    assert.equal(postgresSavedRows[0]?.duration, 30);

    // 2. HTTP response succeeded (DuckDB error was isolated and did not fail request)
    assert.equal(nextCalledWithError, null);
    assert.deepEqual(responseJson, {
      accepted: 1,
      duplicates: 0,
      rejected: 0,
    });
  });
});
