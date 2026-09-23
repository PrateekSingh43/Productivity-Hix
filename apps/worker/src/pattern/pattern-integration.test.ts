/**
 * Real-Postgres Pattern integration tests (§37–§44, PG half).
 *
 * Uses the live database from apps/worker/.env (DIRECT_URL/DATABASE_URL).
 * Skips cleanly when unreachable. Every test creates isolated users
 * (random ids) and deletes them afterwards — cascade removes all rows.
 *
 * Redis/BullMQ half is covered with mocked transport in vertical-slice.test.ts;
 * a live-Redis flow runs below only if REDIS_URL (or Upstash) is reachable.
 */
import { configDotenv } from "dotenv";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { disconnectDb, getDb } from "@repo/db";
import { InMemoryLockProvider } from "../base/idempotency";
import { MemoryWorkerMetricsCollector } from "../shared/metrics";
import { MemoryWorkerLogger } from "../shared/logging";
import { PatternWorker } from "./pattern-worker";
import { PrismaPatternDataProvider } from "./prisma-provider";

configDotenv({ path: new URL("../../.env", import.meta.url) });
// Keep this suite a small neighbor on shared pooler-based databases.
process.env.PGPOOL_MAX ??= "2";

type Database = ReturnType<typeof getDb>;

const WINDOW = { start: "2026-08-20T00:00:00.000Z", end: "2026-09-03T00:00:00.000Z" };
const hasDb = Boolean(process.env.DIRECT_URL ?? process.env.DATABASE_URL);

const createdUsers: string[] = [];
let db: Database;
let dbReachable = false;

async function checkDb(): Promise<boolean> {
  try {
    db = getDb();
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function seedUser(): Promise<string> {
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, displayName: "pattern-int-test" } });
  await db.userPreference.create({ data: { userId, timezone: "UTC", dayBoundary: "00:00" } });
  createdUsers.push(userId);
  return userId;
}

async function seedTelemetry(userId: string, dayIso: string, minutes: number, tag: string) {
  const start = new Date(`${dayIso}T10:00:00.000Z`);
  await db.normalizedActivity.create({
    data: {
      userId,
      externalId: `int-${tag}-${dayIso}`,
      bucketId: "desktop",
      source: "desktop",
      watcher: "active_window",
      timestamp: start,
      duration: minutes * 60,
      data: { application: "Code", windowTitle: "project" },
    },
  });
  return start;
}

async function seedTaskSession(userId: string, taskId: string, dayIso: string, minutes: number) {
  const start = await seedTelemetry(userId, dayIso, minutes, `s-${taskId.slice(0, 8)}`);
  const end = new Date(start.getTime() + minutes * 60_000);
  await db.workSession.create({
    data: {
      userId,
      taskId,
      startedAt: start,
      endedAt: end,
      durationSeconds: minutes * 60,
      source: "manual",
      isPaused: false,
    },
  });
}

function jobFor(userId: string, correlation: string) {
  return {
    userId,
    windowStart: WINDOW.start,
    windowEnd: WINDOW.end,
    reason: "MANUAL_TRIGGER" as const,
    jobCorrelationId: correlation,
    queuedAt: new Date().toISOString(),
  };
}

describe.skipIf(!hasDb)("pattern real-postgres integration", () => {
  beforeAll(async () => {
    dbReachable = await checkDb();
  }, 30_000);

  afterAll(async () => {
    try {
      if (!dbReachable) return;
      await db.user.deleteMany({ where: { id: { in: createdUsers } } });
    } finally {
      await disconnectDb();
    }
  });

  it("insufficient evidence completes honestly with zero findings", async () => {
    if (!dbReachable) return;
    const userId = await seedUser();
    await seedTelemetry(userId, "2026-08-25", 60, "lone");
    const worker = new PatternWorker(db, new PrismaPatternDataProvider(db));
    const result = await worker.run(jobFor(userId, randomUUID()), {
      metrics: new MemoryWorkerMetricsCollector(),
      logger: new MemoryWorkerLogger(),
      idempotencyProvider: new InMemoryLockProvider(),
    });
    expect(result.status).toBe("SUCCEEDED");
    const run = await db.patternAnalysisRun.findFirst({ where: { userId } });
    expect(run?.status).toBe("COMPLETED");
    expect(await db.patternFinding.count({ where: { runId: run!.id } })).toBe(0);
    const diagnostics = run?.diagnosticsJson as unknown as {
      perDetector: Array<{ identity: string; availability: string }>;
    };
    expect(diagnostics.perDetector.find((d) => d.identity === "schedule_variance")?.availability).toBe("NOT_AVAILABLE");
  }, 60_000);

  it("detects a real same-task sustained change with full lineage", async () => {
    if (!dbReachable) return;
    const userId = await seedUser();
    const task = await db.task.create({ data: { userId, title: "int-task" } });
    for (const day of ["2026-07-22", "2026-07-23", "2026-07-24"]) {
      await seedTaskSession(userId, task.id, day, 10);
    }
    for (const day of ["2026-08-25", "2026-08-26", "2026-08-27"]) {
      await seedTaskSession(userId, task.id, day, 60);
    }
    const worker = new PatternWorker(db, new PrismaPatternDataProvider(db));
    const result = await worker.run(jobFor(userId, randomUUID()), {
      metrics: new MemoryWorkerMetricsCollector(),
      logger: new MemoryWorkerLogger(),
      idempotencyProvider: new InMemoryLockProvider(),
    });
    expect(result.status).toBe("SUCCEEDED");
    const run = await db.patternAnalysisRun.findFirst({ where: { userId } });
    expect(run?.status).toBe("COMPLETED");
    const findings = await db.patternFinding.findMany({ where: { runId: run!.id } });
    expect(findings.length).toBeGreaterThan(0);
    const first = findings[0]!.resultJson as unknown as {
      detectorIdentity: string;
      executionStatus: string;
      evidenceRefs: Array<{ sessionIds: string[] }>;
      sample: { qualifyingEpisodes: number; qualifyingDays: number };
    };
    expect(first.detectorIdentity).toBe("extended_continuous_activity");
    expect(first.executionStatus).toBe("DETECTED");
    expect(first.sample.qualifyingEpisodes).toBeGreaterThanOrEqual(3);
    expect(first.sample.qualifyingDays).toBeGreaterThanOrEqual(3);
    expect(first.evidenceRefs.flatMap((r) => r.sessionIds).length).toBeGreaterThan(0);
  }, 90_000);

  it("user isolation holds on real rows", async () => {
    if (!dbReachable) return;
    const userA = await seedUser();
    await seedTelemetry(userA, "2026-08-25", 60, "iso");
    const worker = new PatternWorker(db, new PrismaPatternDataProvider(db));
    await worker.run(jobFor(userA, randomUUID()), {
      metrics: new MemoryWorkerMetricsCollector(),
      logger: new MemoryWorkerLogger(),
      idempotencyProvider: new InMemoryLockProvider(),
    });
    const userB = await seedUser();
    expect(await db.patternAnalysisRun.findFirst({ where: { userId: userB } })).toBeNull();
    expect(await db.patternFinding.findMany({ where: { userId: userB } })).toEqual([]);
  }, 60_000);

  it("failure persists FAILED on real rows and retry succeeds", async () => {
    if (!dbReachable) return;
    const userId = await seedUser();
    await seedTelemetry(userId, "2026-08-25", 60, "fail");
    const broken = new PatternWorker(db, {
      loadInput: async () => { throw new Error("real-pg synthetic failure"); },
      readWatermarks: async () => ({
        maxSourceAt: WINDOW.end, activityCount: 1, activityDurationSum: 3600,
        sessionCount: 0, checkInCount: 0, taskCount: 0,
      }),
    });
    await expect(broken.run(jobFor(userId, randomUUID()), {
      metrics: new MemoryWorkerMetricsCollector(),
      logger: new MemoryWorkerLogger(),
      idempotencyProvider: new InMemoryLockProvider(),
    })).rejects.toThrow("real-pg synthetic failure");
    const failed = await db.patternAnalysisRun.findFirst({ where: { userId } });
    expect(failed?.status).toBe("FAILED");
    expect(failed?.error).toContain("real-pg synthetic failure");
    expect(await db.patternFinding.count({ where: { runId: failed!.id } })).toBe(0);
    const worker = new PatternWorker(db, new PrismaPatternDataProvider(db));
    const retry = await worker.run(jobFor(userId, randomUUID()), {
      metrics: new MemoryWorkerMetricsCollector(),
      logger: new MemoryWorkerLogger(),
      idempotencyProvider: new InMemoryLockProvider(),
    });
    expect(retry.status).toBe("SUCCEEDED");
    expect((await db.patternAnalysisRun.findFirst({ where: { userId } }))?.status).toBe("COMPLETED");
  }, 90_000);

  it("duplicate logical requests stay idempotent on real rows", async () => {
    if (!dbReachable) return;
    const userId = await seedUser();
    await seedTelemetry(userId, "2026-08-25", 60, "dup");
    const worker = new PatternWorker(db, new PrismaPatternDataProvider(db));
    const opts = {
      metrics: new MemoryWorkerMetricsCollector(),
      logger: new MemoryWorkerLogger(),
      idempotencyProvider: new InMemoryLockProvider(),
    };
    const first = await worker.run(jobFor(userId, randomUUID()), opts);
    const second = await worker.run(jobFor(userId, randomUUID()), opts);
    expect(first.status).toBe("SUCCEEDED");
    expect(second.status).toBe("SUCCEEDED");
    expect(await db.patternAnalysisRun.count({ where: { userId } })).toBe(1);
  }, 90_000);

  it("new telemetry invalidates the fingerprint so reruns recompute", async () => {
    if (!dbReachable) return;
    const userId = await seedUser();
    await seedTelemetry(userId, "2026-08-25", 60, "fp1");
    const worker = new PatternWorker(db, new PrismaPatternDataProvider(db));
    const data = worker.validate(jobFor(userId, randomUUID()));
    const before = await worker.computeFingerprint(data);
    await seedTelemetry(userId, "2026-08-26", 30, "fp2");
    const after = await worker.computeFingerprint(data);
    expect(after).not.toBe(before);
  }, 60_000);

  it("partial publish failure rolls back: no findings visible, run FAILED", async () => {
    if (!dbReachable) return;
    const userId = await seedUser();
    const task = await db.task.create({ data: { userId, title: "int-atomic" } });
    for (const day of ["2026-07-22", "2026-07-23", "2026-07-24"]) {
      await seedTaskSession(userId, task.id, day, 10);
    }
    for (const day of ["2026-08-25", "2026-08-26", "2026-08-27"]) {
      await seedTaskSession(userId, task.id, day, 60);
    }
    // Fail the terminal run-state write inside the publication transaction:
    // any findings already staged in the same transaction must roll back too.
    const flaky = new Proxy(db, {
      get: (target, prop, receiver) => {
        if (prop === "$transaction") {
          return async (fn: (tx: unknown) => Promise<unknown>) =>
            (target as unknown as { $transaction: (f: (tx: unknown) => Promise<unknown>) => Promise<unknown> }).$transaction(
              async (realTx: unknown) => {
                const runsProxy = new Proxy((realTx as Record<string, unknown>).patternAnalysisRun as object, {
                  get: (runs, key) =>
                    key === "update" || key === "updateMany"
                      ? async () => { throw new Error("synthetic publish failure"); }
                      : (runs as Record<string, unknown>)[key as string],
                });
                const txProxy = new Proxy(realTx as object, {
                  get: (t, key) =>
                    key === "patternAnalysisRun" ? runsProxy : (t as Record<string, unknown>)[key as string],
                });
                return fn(txProxy);
              },
            );
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const worker = new PatternWorker(flaky as never, new PrismaPatternDataProvider(flaky as never));
    await expect(worker.run(jobFor(userId, randomUUID()), {
      metrics: new MemoryWorkerMetricsCollector(),
      logger: new MemoryWorkerLogger(),
      idempotencyProvider: new InMemoryLockProvider(),
    })).rejects.toThrow("synthetic publish failure");
    const run = await db.patternAnalysisRun.findFirst({ where: { userId } });
    expect(run?.status).toBe("FAILED");
    expect(await db.patternFinding.count({ where: { runId: run!.id } })).toBe(0);
  }, 90_000);
});
