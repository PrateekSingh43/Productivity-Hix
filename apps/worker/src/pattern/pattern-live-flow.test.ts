/**
 * Live BullMQ + Postgres flow (§37 transport half).
 *
 * Real Redis queue -> real WorkerRuntime -> real PatternWorker ->
 * real Postgres rows. Skips when Redis or Postgres is unreachable.
 * Uses an isolated queue prefix so test jobs never touch dev queues.
 */
import { configDotenv } from "dotenv";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { disconnectDb, getDb } from "@repo/db";
import { PRODUCTIVEHIX_QUEUES } from "@repo/types";
import { QueueManager } from "../runtime/queue";
import { WorkerRuntime } from "../runtime/worker-runtime";
import { MemoryWorkerMetricsCollector } from "../shared/metrics";
import { PatternWorker } from "./pattern-worker";
import { PrismaPatternDataProvider } from "./prisma-provider";

configDotenv({ path: new URL("../../.env", import.meta.url) });

const hasInfra = Boolean(process.env.REDIS_URL) && Boolean(process.env.DIRECT_URL ?? process.env.DATABASE_URL);
const WINDOW = { start: "2026-08-20T00:00:00.000Z", end: "2026-09-03T00:00:00.000Z" };

describe.skipIf(!hasInfra)("pattern live queue flow", () => {
  const prefix = `test-patterns-${randomUUID().slice(0, 8)}`;
  const createdUsers: string[] = [];
  let redis: Redis;
  let runtime: WorkerRuntime;
  let queueManager: QueueManager;
  let live = false;

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL!, {
      connectTimeout: 5000,
      maxRetriesPerRequest: null,
    });
    try {
      await redis.ping();
      live = true;
    } catch {
      redis.disconnect();
      return;
    }
    const db = getDb();
    runtime = new WorkerRuntime({
      connection: redis.duplicate(),
      metrics: new MemoryWorkerMetricsCollector(),
      prefix,
    });
    runtime.registerWorker(new PatternWorker(db, new PrismaPatternDataProvider(db)));
    await runtime.start();
    queueManager = new QueueManager({ connection: redis.duplicate(), prefix });
  }, 30_000);

  afterAll(async () => {
    try {
      if (live) {
        const db = getDb();
        await db.user.deleteMany({ where: { id: { in: createdUsers } } });
        await runtime?.stop();
        await queueManager?.closeAll();
      }
    } finally {
      redis?.disconnect();
      await disconnectDb();
    }
  });

  it("queue -> runtime -> worker -> postgres produces a durable run", async () => {
    if (!live) return;
    const db = getDb();
    const userId = randomUUID();
    await db.user.create({ data: { id: userId, displayName: "pattern-live-flow" } });
    await db.userPreference.create({ data: { userId, timezone: "UTC", dayBoundary: "00:00" } });
    createdUsers.push(userId);
    await db.normalizedActivity.create({
      data: {
        userId,
        externalId: `live-${userId.slice(0, 8)}`,
        bucketId: "desktop",
        source: "desktop",
        watcher: "active_window",
        timestamp: new Date("2026-08-25T10:00:00.000Z"),
        duration: 3600,
        data: { application: "Code", windowTitle: "project" },
      },
    });

    const jobCorrelationId = randomUUID();
    const envelope = {
      id: randomUUID(),
      eventType: "pattern.analysis.requested",
      aggregateType: "pattern",
      aggregateId: userId,
      payload: {
        userId,
        windowStart: WINDOW.start,
        windowEnd: WINDOW.end,
        reason: "MANUAL_TRIGGER",
        jobCorrelationId,
        queuedAt: new Date().toISOString(),
      },
      correlationId: jobCorrelationId,
      causationId: null,
      schemaVersion: "1.0.0",
      occurredAt: new Date().toISOString(),
    };
    await queueManager.addJob(PRODUCTIVEHIX_QUEUES.PATTERN_ANALYSIS, "pattern.analysis.requested", envelope, {
      jobId: `test-live-${userId}`,
    });

    let run: { status: string; state: string } | null = null;
    for (let i = 0; i < 60 && (!run || run.status === "RUNNING"); i++) {
      await new Promise((r) => setTimeout(r, 500));
      run = await db.patternAnalysisRun.findFirst({ where: { userId } });
    }
    expect(run?.status).toBe("COMPLETED");
    expect(run?.state).not.toBe("pending");
    expect(await db.patternFinding.count({ where: { userId } })).toBe(0);
  }, 90_000);
});
