import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DuckDBClient,
  ingestTelemetryEvents,
  getTopApplications,
  getTopDomains,
  getActiveVsIdleSummary,
} from "./index";
import type { TelemetryEvent } from "@repo/telemetry";

test("DuckDB initializes, ingests events, and computes top apps and domains", async () => {
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

  const count = await ingestTelemetryEvents(client, sampleEvents);
  assert.equal(count, 4);

  // Verify provenance stored in DuckDB
  const conn = client.getConnection();
  const provRes = await conn.runAndReadAll(`SELECT collector FROM telemetry_events WHERE event_id = 'e4'`);
  assert.equal(String(provRes.getRows()[0][0]), "browser-extension");

  const topApps = await getTopApplications(client);
  assert.equal(topApps.length, 1);
  assert.equal(topApps[0].application, "Code.exe");
  assert.equal(topApps[0].totalDurationMs, 60000);

  const topDomains = await getTopDomains(client);
  assert.equal(topDomains.length, 1);
  assert.equal(topDomains[0].domain, "github.com");
  assert.equal(topDomains[0].totalDurationMs, 30000);

  const summary = await getActiveVsIdleSummary(client);
  assert.equal(summary.activeMs, 60000);
  assert.equal(summary.idleMs, 180000);

  await client.close();
});
