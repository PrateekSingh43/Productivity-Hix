import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DuckDBClient,
  ingestTelemetryEvents,
  updateTelemetryEventDuration,
  getTopApplications,
  getTopDomains,
  getActiveVsIdleSummary,
  getHourlyDistribution,
} from "./index";
import type { TelemetryEvent } from "@repo/telemetry";

test("DuckDB initializes, ingests events with userId, and computes top apps and domains", async () => {
  const client = new DuckDBClient();
  await client.initialize(":memory:");

  const sampleEvents: TelemetryEvent[] = [
    {
      eventId: "e1",
      source: "desktop",
      installationId: "inst-1",
      eventType: "active_window",
      timestamp: "2026-09-04T18:00:00.000Z",
      durationMs: 45000,
      data: {
        application: "Code.exe",
        windowTitle: "ProductiveHix - index.ts",
      },
    },
    {
      eventId: "e2",
      source: "desktop",
      installationId: "inst-1",
      eventType: "active_window",
      timestamp: "2026-09-04T18:00:45.000Z",
      durationMs: 15000,
      data: {
        application: "Code.exe",
        windowTitle: "ProductiveHix - schema.prisma",
      },
    },
    {
      eventId: "e3",
      source: "desktop",
      installationId: "inst-1",
      eventType: "afk",
      timestamp: "2026-09-04T18:01:00.000Z",
      durationMs: 180000,
      data: {
        state: "afk",
      },
    },
    {
      eventId: "e4",
      source: "browser",
      installationId: "inst-1",
      eventType: "active_tab",
      timestamp: "2026-09-04T18:04:00.000Z",
      durationMs: 30000,
      data: {
        domain: "github.com",
        sanitizedUrl: "https://github.com/ActivityWatch/activitywatch",
        pageTitle: "ActivityWatch GitHub",
      },
      provenance: {
        collector: "browser-extension",
      },
    },
  ];

  const count = await ingestTelemetryEvents(client, "user-1", sampleEvents);
  assert.equal(count, 4);

  // Verify provenance and user_id stored in DuckDB
  const conn = client.getConnection();
  const provRes = await conn.runAndReadAll(`SELECT collector, user_id FROM telemetry_events WHERE event_id = 'e4'`);
  const rows = provRes.getRows();
  assert.equal(String(rows[0][0]), "browser-extension");
  assert.equal(String(rows[0][1]), "user-1");

  const topApps = await getTopApplications(client, "user-1");
  assert.equal(topApps.length, 1);
  assert.equal(topApps[0].application, "Code.exe");
  assert.equal(topApps[0].totalDurationMs, 60000);

  const topDomains = await getTopDomains(client, "user-1");
  assert.equal(topDomains.length, 1);
  assert.equal(topDomains[0].domain, "github.com");
  assert.equal(topDomains[0].totalDurationMs, 30000);

  const summary = await getActiveVsIdleSummary(client, "user-1");
  assert.equal(summary.activeMs, 60000);
  assert.equal(summary.idleMs, 180000);

  const hourly = await getHourlyDistribution(client, "user-1");
  assert.equal(hourly.length, 1);
  assert.equal(hourly[0].hour, 18);
  assert.equal(hourly[0].totalMs, 270000);

  await client.close();
});

test("DuckDB enforces strict user isolation across analytical queries", async () => {
  const client = new DuckDBClient();
  await client.initialize(":memory:");

  const userAEvents: TelemetryEvent[] = [
    {
      eventId: "ua-1",
      source: "desktop",
      installationId: "inst-a",
      eventType: "active_window",
      timestamp: "2026-09-04T10:00:00.000Z",
      durationMs: 50000,
      data: { application: "Figma.exe", windowTitle: "Design System" },
    },
  ];

  const userBEvents: TelemetryEvent[] = [
    {
      eventId: "ub-1",
      source: "desktop",
      installationId: "inst-b",
      eventType: "active_window",
      timestamp: "2026-09-04T10:00:00.000Z",
      durationMs: 30000,
      data: { application: "Code.exe", windowTitle: "auth.ts" },
    },
  ];

  await ingestTelemetryEvents(client, "user-A", userAEvents);
  await ingestTelemetryEvents(client, "user-B", userBEvents);

  // Query User A
  const appsA = await getTopApplications(client, "user-A");
  assert.equal(appsA.length, 1);
  assert.equal(appsA[0].application, "Figma.exe");
  assert.equal(appsA[0].totalDurationMs, 50000);

  // Query User B
  const appsB = await getTopApplications(client, "user-B");
  assert.equal(appsB.length, 1);
  assert.equal(appsB[0].application, "Code.exe");
  assert.equal(appsB[0].totalDurationMs, 30000);

  // Cross-user leak check: User A never sees User B's Code.exe
  assert.equal(appsA.some((a) => a.application === "Code.exe"), false);
  assert.equal(appsB.some((b) => b.application === "Figma.exe"), false);

  await client.close();
});

test("DuckDB update projection correctly modifies existing event duration", async () => {
  const client = new DuckDBClient();
  await client.initialize(":memory:");

  const event: TelemetryEvent = {
    eventId: "e-upd",
    source: "desktop",
    installationId: "inst-1",
    eventType: "active_window",
    timestamp: "2026-09-04T12:00:00.000Z",
    durationMs: 30000,
    data: { application: "Slack.exe", windowTitle: "general" },
  };

  await ingestTelemetryEvents(client, "user-1", [event]);

  const initialApps = await getTopApplications(client, "user-1");
  assert.equal(initialApps[0].totalDurationMs, 30000);

  // Update duration projection (e.g. ongoing activity extended to 45s)
  await updateTelemetryEventDuration(client, "user-1", "e-upd", 45000);

  const updatedApps = await getTopApplications(client, "user-1");
  assert.equal(updatedApps[0].totalDurationMs, 45000);

  await client.close();
});

test("DuckDB persistence preserves telemetry across reopen of persistent database file", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "duckdb-test-"));
  const dbFile = path.join(tmpDir, "test.duckdb");

  try {
    // 1. First session: initialize on disk and write event
    const client1 = new DuckDBClient();
    await client1.initialize(dbFile);

    const event: TelemetryEvent = {
      eventId: "e-persist",
      source: "browser",
      installationId: "inst-persist",
      eventType: "active_tab",
      timestamp: "2026-09-04T14:00:00.000Z",
      durationMs: 25000,
      data: {
        domain: "linear.app",
        sanitizedUrl: "https://linear.app/issue/1",
        pageTitle: "Linear Issue",
      },
    };

    await ingestTelemetryEvents(client1, "user-persist", [event]);
    await client1.close();

    // 2. Second session: re-open existing persistent DuckDB file
    const client2 = new DuckDBClient();
    await client2.initialize(dbFile);

    const domains = await getTopDomains(client2, "user-persist");
    assert.equal(domains.length, 1);
    assert.equal(domains[0].domain, "linear.app");
    assert.equal(domains[0].totalDurationMs, 25000);

    await client2.close();
  } finally {
    // Cleanup temporary files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

test("DuckDB schema compatibility check and reset behavior", async () => {
  const client = new DuckDBClient();
  await client.initialize(":memory:");

  // Initially schema is compatible
  const isCompatibleInitial = await client.isSchemaCompatible();
  assert.equal(isCompatibleInitial, true);

  // Simulate legacy schema without user_id column
  const conn = client.getConnection();
  await conn.runAndReadAll(`DROP TABLE telemetry_events;`);
  await conn.runAndReadAll(`
    CREATE TABLE telemetry_events (
      event_id VARCHAR PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL,
      source VARCHAR NOT NULL
    );
  `);

  // Schema must be recognized as INCOMPATIBLE
  const isCompatibleLegacy = await client.isSchemaCompatible();
  assert.equal(isCompatibleLegacy, false, "Legacy schema lacking user_id must be detected as incompatible");

  // Reset schema drops legacy table and recreates canonical user-isolated schema
  await client.resetSchema();
  const isCompatibleAfterReset = await client.isSchemaCompatible();
  assert.equal(isCompatibleAfterReset, true, "Schema must be compatible after reset");

  // Ingest into cleanly reset schema
  const testEvent: TelemetryEvent = {
    eventId: "e-reset-test",
    source: "desktop",
    installationId: "inst-1",
    eventType: "active_window",
    timestamp: "2026-09-04T12:00:00.000Z",
    durationMs: 10000,
    data: { application: "Code.exe", windowTitle: "editor" },
  };
  const count = await ingestTelemetryEvents(client, "user-reset", [testEvent]);
  assert.equal(count, 1);

  await client.close();
});

