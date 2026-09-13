import fs from "node:fs";
import path from "node:path";
import { DuckDBClient, ingestTelemetryEvents } from "@repo/data";
import type { TelemetryEvent } from "@repo/telemetry";
import { getDb } from "../../lib/prisma";
import { env } from "../../config/env";

let duckdbClient: DuckDBClient | null = null;
let isSynchronized = false;

export function resolveDuckDBPath(): string {
  if (process.env.NODE_ENV === "test" || env.NODE_ENV === "test") {
    return ":memory:";
  }
  if (env.DUCKDB_PATH) {
    return env.DUCKDB_PATH;
  }
  if (process.env.DUCKDB_PATH) {
    return process.env.DUCKDB_PATH;
  }
  const defaultPath = path.resolve(process.cwd(), "data/analytics.duckdb");
  return defaultPath;
}

export async function getDuckDB(): Promise<DuckDBClient> {
  if (!duckdbClient) {
    const client = new DuckDBClient();
    const dbPath = resolveDuckDBPath();
    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    await client.initialize(dbPath);
    duckdbClient = client;
  }
  return duckdbClient;
}

export async function closeDuckDB(): Promise<void> {
  if (duckdbClient) {
    await duckdbClient.close();
    duckdbClient = null;
    isSynchronized = false;
  }
}

export async function rebuildDuckDBFromPostgres(userId?: string): Promise<number> {
  isSynchronized = false;
  const client = await getDuckDB();
  const conn = client.getConnection();
  const prisma = getDb();

  // True rebuild contract: delete projection before reconstructing from PostgreSQL source of truth
  if (userId && userId.trim() !== "") {
    const safeUserId = userId.replace(/'/g, "''");
    await conn.run(`DELETE FROM telemetry_events WHERE user_id = '${safeUserId}';`);
  } else {
    await conn.run(`DELETE FROM telemetry_events;`);
  }

  const rows = await prisma.normalizedActivity.findMany({
    where: userId ? { userId } : {},
    orderBy: { timestamp: "asc" },
  });

  if (rows.length === 0) {
    return 0;
  }

  const userMap = new Map<string, TelemetryEvent[]>();

  for (const r of rows) {
    const data = (r.data && typeof r.data === "object" ? r.data : {}) as Record<string, unknown>;
    const event = {
      eventId: r.externalId,
      source: r.source === "browser" ? "browser" : "desktop",
      installationId: r.bucketId,
      eventType: r.watcher,
      timestamp: r.timestamp.toISOString(),
      durationMs: Math.round(r.duration * 1000),
      data: data as any,
      provenance: (data.provenance as any) ?? {
        collector: r.source === "browser" ? "browser-extension" : "activitywatch",
        bucketId: r.bucketId,
      },
    } as unknown as TelemetryEvent;

    const list = userMap.get(r.userId) ?? [];
    list.push(event);
    userMap.set(r.userId, list);
  }

  let totalIngested = 0;
  for (const [uid, events] of userMap.entries()) {
    totalIngested += await ingestTelemetryEvents(client, uid, events);
  }

  return totalIngested;
}

export async function ensureDuckDBSynchronized(): Promise<void> {
  isSynchronized = false;
  const client = await getDuckDB();
  const isCompatible = await client.isSchemaCompatible();

  if (!isCompatible) {
    // Schema mismatch/corrupted: reset schema and rebuild from PostgreSQL source of truth
    await client.resetSchema();
    await rebuildDuckDBFromPostgres();
    isSynchronized = true;
    return;
  }

  const prisma = getDb();
  const pgAgg = await prisma.normalizedActivity.aggregate({
    _count: { id: true },
    _sum: { duration: true },
    _max: { timestamp: true },
  });

  const pgCount = pgAgg._count?.id ?? 0;
  const pgSumDurationSec = pgAgg._sum?.duration ?? 0;
  const pgMaxTimestampMs = pgAgg._max?.timestamp ? pgAgg._max.timestamp.getTime() : 0;

  const conn = client.getConnection();
  const duckAggRes = await conn.runAndReadAll(`
    SELECT COUNT(*), COALESCE(SUM(duration_ms), 0), MAX(timestamp)
    FROM telemetry_events;
  `);
  const duckRows = duckAggRes.getRows();
  const duckCount = Number(duckRows[0]?.[0] ?? 0);
  const duckSumDurationMs = Number(duckRows[0]?.[1] ?? 0);
  const duckLatestRaw = duckRows[0]?.[2];
  const duckMaxTimestampMs = duckLatestRaw ? new Date(String(duckLatestRaw)).getTime() : 0;

  // Conservative synchronization check:
  // 1. Row counts must match exactly (catches phantom or missing rows)
  // 2. Sum of duration must match (catches in-place duration updates for existing events!)
  // 3. Max timestamp must match (catches newer events or timestamp shifts)
  const countMismatch = duckCount !== pgCount;
  const durationMismatch = Math.abs(pgSumDurationSec - duckSumDurationMs / 1000) > 0.5;
  const maxTimestampMismatch = Math.abs(pgMaxTimestampMs - duckMaxTimestampMs) > 1000;

  if (countMismatch || durationMismatch || maxTimestampMismatch) {
    await rebuildDuckDBFromPostgres();
  }

  isSynchronized = true;
}

export function isDuckDBSynchronized(): boolean {
  return isSynchronized;
}
