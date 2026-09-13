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
    duckdbClient = new DuckDBClient();
    const dbPath = resolveDuckDBPath();
    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    await duckdbClient.initialize(dbPath);
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
  const client = await getDuckDB();
  const prisma = getDb();

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
  const pgCount = await prisma.normalizedActivity.count();

  if (pgCount === 0) {
    isSynchronized = true;
    return;
  }

  const conn = client.getConnection();
  const duckCountRes = await conn.runAndReadAll(`SELECT COUNT(*) FROM telemetry_events;`);
  const duckCount = Number(duckCountRes.getRows()[0]?.[0] ?? 0);

  if (duckCount === 0 && pgCount > 0) {
    // DuckDB projection empty but PostgreSQL has rows
    await rebuildDuckDBFromPostgres();
    isSynchronized = true;
    return;
  }

  // Check freshness heuristic (max timestamp)
  const pgLatest = await prisma.normalizedActivity.findFirst({
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });

  const duckLatestRes = await conn.runAndReadAll(`SELECT MAX(timestamp) FROM telemetry_events;`);
  const duckLatestRaw = duckLatestRes.getRows()[0]?.[0];
  const duckLatestMs = duckLatestRaw ? new Date(String(duckLatestRaw)).getTime() : 0;
  const pgLatestMs = pgLatest?.timestamp ? pgLatest.timestamp.getTime() : 0;

  if (duckCount < pgCount || pgLatestMs > duckLatestMs) {
    // Inconsistency or missing updates detected -> sync projection from PostgreSQL
    await rebuildDuckDBFromPostgres();
  }

  isSynchronized = true;
}

export function isDuckDBSynchronized(): boolean {
  return isSynchronized;
}
