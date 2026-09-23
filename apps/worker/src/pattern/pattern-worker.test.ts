import { readFileSync } from "node:fs";
import { describe, it, expect, beforeEach } from "vitest";
import { PRODUCTIVEHIX_QUEUES } from "@repo/types";
import { InMemoryLockProvider } from "../base/idempotency";
import { MemoryWorkerMetricsCollector } from "../shared/metrics";
import { MemoryWorkerLogger } from "../shared/logging";
import {
  WorkerValidationError,
  WorkerPermanentError,
} from "../base/errors";
import { PatternWorker, type PatternWorkerResult } from "./pattern-worker";
import type { PatternDataProvider, SourceWatermarks } from "./data-provider";
import type { PatternPipelineInput } from "@repo/analytics";

const USER = "user-pattern-1";
const WINDOW = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z" };

function job(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER,
    windowStart: WINDOW.start,
    windowEnd: WINDOW.end,
    reason: "MANUAL_TRIGGER",
    jobCorrelationId: "corr-1",
    queuedAt: new Date().toISOString(),
    ...overrides,
  };
}

function emptyInput(): PatternPipelineInput {
  return {
    userId: USER,
    timezone: "UTC",
    boundary: "00:00",
    window: { ...WINDOW },
    baselineWindow: { start: "2026-08-02T00:00:00.000Z", end: WINDOW.start },
    timeline: {
      windowStart: WINDOW.start, windowEnd: WINDOW.end, totalDurationSeconds: 0, blocks: [],
      coverageSummary: {
        totalDurationSeconds: 0, observedSeconds: 0, observedReportedSeconds: 0,
        reportedSeconds: 0, unknownSeconds: 0, explainedGapSeconds: 0, coverageRatio: 0,
      },
    },
    baseline: {
      windowStart: "2026-08-02T00:00:00.000Z", windowEnd: WINDOW.start, totalDurationSeconds: 0, blocks: [],
      coverageSummary: {
        totalDurationSeconds: 0, observedSeconds: 0, observedReportedSeconds: 0,
        reportedSeconds: 0, unknownSeconds: 0, explainedGapSeconds: 0, coverageRatio: 0,
      },
    },
    sessions: [],
    reports: [],
    outcomes: [],
    tasks: [],
    connected: false,
    recordingHistory: { firstObservationAt: null, lastObservationAt: null, recordedDays: 0, connected: false },
  };
}

interface FakeRunRow {
  id: string;
  userId: string;
  windowStart: string;
  windowEnd: string;
  identityKey: string;
  inputFingerprint: string;
  status: string;
  state: string;
  diagnosticsJson: unknown;
  detectorVersion: string;
  configVersion: string;
  jobCorrelationId: string | null;
  computedAt: string | null;
  error?: string | null;
}

function createFakeDb() {
  const runs: FakeRunRow[] = [];
  const findings: Array<Record<string, unknown>> = [];
  let ids = 0;
  const match = (row: FakeRunRow, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const actual = (row as unknown as Record<string, unknown>)[k];
      if (v && typeof v === "object" && "gt" in (v as Record<string, unknown>)) {
        return (actual as string) > String((v as Record<string, unknown>).gt);
      }
      return actual === v;
    });
  const db = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    runs,
    findings,
    patternAnalysisRun: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        runs.filter((r) => match(r, where)).sort((a, b) => (a.computedAt ?? "") < (b.computedAt ?? "") ? 1 : -1)[0] ?? null,
      findUnique: async ({ where }: { where: { userId_identityKey?: { userId: string; identityKey: string } } }) =>
        runs.find((r) => r.userId === where.userId_identityKey?.userId && r.identityKey === where.userId_identityKey?.identityKey) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `run-${++ids}`, computedAt: null, ...data } as unknown as FakeRunRow;
        runs.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = runs.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      upsert: async ({ where, create, update }: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const key = (where as { userId_identityKey: { userId: string; identityKey: string } }).userId_identityKey;
        const existing = runs.find((r) => r.userId === key.userId && r.identityKey === key.identityKey);
        if (existing) { Object.assign(existing, update); return existing; }
        const row = { id: `run-${++ids}`, computedAt: null, ...create } as unknown as FakeRunRow;
        runs.push(row);
        return row;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const row of runs) {
          if (match(row, where)) { Object.assign(row, data); count++; }
        }
        return { count };
      },
    },
    patternFinding: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        findings.filter((f) => Object.entries(where).every(([k, v]) => k === "select" || f[k] === v)),
      count: async ({ where }: { where: Record<string, unknown> }) =>
        findings.filter((f) => Object.entries(where).every(([k, v]) => f[k] === v)).length,
      delete: async ({ where }: { where: { id: string } }) => {
        const index = findings.findIndex((f) => f.id === where.id);
        if (index >= 0) findings.splice(index, 1);
        return {};
      },
      upsert: async ({ where, create, update }: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const key = (where as { userId_patternKey: { userId: string; patternKey: string } }).userId_patternKey;
        const existing = findings.find((f) => f.userId === key.userId && f.patternKey === key.patternKey);
        if (existing) { Object.assign(existing, update); return existing; }
        const row = { id: `finding-${++ids}`, ...create };
        findings.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: { runId: string } }) => {
        const before = findings.length;
        for (let i = findings.length - 1; i >= 0; i--) {
          if (findings[i]!.runId === where.runId) findings.splice(i, 1);
        }
        return { count: before - findings.length };
      },
    },
  };
  return db;
}

export type FakeDb = ReturnType<typeof createFakeDb>;

const BASE_WATERMARKS: SourceWatermarks = {
  maxSourceAt: "2026-09-15T00:00:00.000Z",
  activityCount: 0,
  activityDurationSum: 0,
  sessionCount: 0,
  checkInCount: 0,
  taskCount: 0,
};

function stubProvider(input: PatternPipelineInput, watermarksSequence: SourceWatermarks[] = [BASE_WATERMARKS]) {
  let watermarkCalls = 0;
  let loadCalls = 0;
  const provider: PatternDataProvider = {
    loadInput: async () => { loadCalls++; return input; },
    readWatermarks: async () => watermarksSequence[Math.min(watermarkCalls++, watermarksSequence.length - 1)]!,
  };
  return { provider, getCalls: () => loadCalls };
}

describe("PatternWorker", () => {
  let db: FakeDb;
  let metrics: MemoryWorkerMetricsCollector;
  let logger: MemoryWorkerLogger;
  let locks: InMemoryLockProvider;

  beforeEach(() => {
    db = createFakeDb();
    metrics = new MemoryWorkerMetricsCollector();
    logger = new MemoryWorkerLogger();
    locks = new InMemoryLockProvider();
  });

  it("fingerprint: same source watermarks produce the same fingerprint", async () => {
    const { provider } = stubProvider(emptyInput());
    const worker = new PatternWorker(db as never, provider);
    const data = worker.validate(job());
    expect(await worker.computeFingerprint(data)).toBe(await worker.computeFingerprint(data));
  });

  it("fingerprint: every watermark mutation invalidates the fingerprint", async () => {
    const mutations: Array<{ field: keyof SourceWatermarks; value: string | number }> = [
      { field: "maxSourceAt", value: "2026-09-16T00:00:00.000Z" },
      { field: "activityCount", value: 1 },
      // In-place telemetry duration growth without any createdAt change.
      { field: "activityDurationSum", value: 3600 },
      { field: "sessionCount", value: 1 },
      { field: "checkInCount", value: 1 },
      { field: "taskCount", value: 1 },
    ];
    for (const { field, value } of mutations) {
      const { provider } = stubProvider(emptyInput(), [
        BASE_WATERMARKS,
        { ...BASE_WATERMARKS, [field]: value },
      ]);
      const worker = new PatternWorker(db as never, provider);
      const data = worker.validate(job());
      const before = await worker.computeFingerprint(data);
      const after = await worker.computeFingerprint(data);
      expect(after, `watermark field ${field} must invalidate the fingerprint`).not.toBe(before);
    }
  });

  it("fingerprint: canonical serialization is key-order independent", async () => {
    const { canonicalSourceWatermarks } = await import("./data-provider.js");
    const a = canonicalSourceWatermarks({ ...BASE_WATERMARKS });
    const reordered = JSON.parse(JSON.stringify({
      taskCount: 0, checkInCount: 0, sessionCount: 0,
      activityDurationSum: 0, activityCount: 0, maxSourceAt: "2026-09-15T00:00:00.000Z",
    }));
    expect(canonicalSourceWatermarks(reordered)).toBe(a);
  });

  it("registers on the pattern-analysis queue", () => {
    const { provider } = stubProvider(emptyInput());
    const worker = new PatternWorker(db as never, provider);
    expect(worker.queueName).toBe(PRODUCTIVEHIX_QUEUES.PATTERN_ANALYSIS);
    expect(worker.workerName).toBe("PatternWorker");
  });

  it("rejects invalid payloads as permanent validation errors", async () => {
    const { provider } = stubProvider(emptyInput());
    const worker = new PatternWorker(db as never, provider);
    await expect(worker.run(null, { metrics, logger })).rejects.toThrow(WorkerValidationError);
    await expect(worker.run({ userId: USER }, { metrics, logger })).rejects.toThrow(WorkerValidationError);
  });

  it("rejects unknown detectors as permanent errors", async () => {
    const { provider } = stubProvider(emptyInput());
    const worker = new PatternWorker(db as never, provider);
    await expect(
      worker.run(job({ targetDetectors: ["nope_not_a_detector"] }), { metrics, logger })
    ).rejects.toThrow(WorkerPermanentError);
  });

  it("unwraps outbox DomainEventEnvelope payloads", async () => {
    const { provider } = stubProvider(emptyInput());
    const worker = new PatternWorker(db as never, provider);
    const result = await worker.run(
      {
        id: "evt-1", eventType: "pattern.analysis.requested", aggregateType: "pattern",
        aggregateId: USER, payload: job(), correlationId: "corr-1", schemaVersion: "1.0.0",
        occurredAt: new Date().toISOString(),
      },
      { metrics, logger, idempotencyProvider: locks }
    );
    expect(result.status).toBe("SUCCEEDED");
  });

  it("computes deterministic job identity", () => {
    const { provider } = stubProvider(emptyInput());
    const worker = new PatternWorker(db as never, provider);
    const a = worker.getJobIdentity(worker.validate(job()));
    const b = worker.getJobIdentity(worker.validate(job({ targetDetectors: ["task_execution_fragmentation", "context_switching_density"] })));
    const c = worker.getJobIdentity(worker.validate(job({ targetDetectors: ["context_switching_density", "task_execution_fragmentation"] })));
    expect(a).toBe(worker.getJobIdentity(worker.validate(job())));
    expect(b).toBe(c);
    expect(a).not.toBe(b);
  });

  it("persists a COMPLETED run for empty evidence without fabricating patterns", async () => {
    const { provider, getCalls } = stubProvider(emptyInput());
    const worker = new PatternWorker(db as never, provider);
    const result = await worker.run(job(), { metrics, logger, idempotencyProvider: locks });
    expect(result.status).toBe("SUCCEEDED");
    if (result.status === "SUCCEEDED") {
      const value = result.value as PatternWorkerResult;
      expect(value.patternsFound).toBe(0);
      expect(value.state).toBe("not-connected");
    }
    expect(getCalls()).toBeGreaterThan(0);
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0]!.status).toBe("COMPLETED");
    expect(db.findings).toHaveLength(0);
  });

  it("is idempotent: rerun with unchanged inputs does not recompute", async () => {
    const { provider, getCalls } = stubProvider(emptyInput());
    const worker = new PatternWorker(db as never, provider);
    const first = await worker.run(job(), { metrics, logger, idempotencyProvider: locks });
    expect(first.status).toBe("SUCCEEDED");
    const callsAfterFirst = getCalls();
    const second = await worker.run(job(), { metrics, logger, idempotencyProvider: locks });
    expect(second.status).toBe("SUCCEEDED");
    expect(getCalls()).toBe(callsAfterFirst);
    expect(db.runs).toHaveLength(1);
  });

  it("discards stale output when inputs change mid-run (supersession)", async () => {
    const { provider } = stubProvider(emptyInput(), [
      BASE_WATERMARKS,
      { ...BASE_WATERMARKS, maxSourceAt: "2026-09-16T00:00:00.000Z" },
    ]);
    const worker = new PatternWorker(db as never, provider);
    const result = await worker.run(job(), { metrics, logger, idempotencyProvider: locks });
    expect(result.status).toBe("SUPERSEDED");
    expect(db.runs.every((r) => r.status !== "COMPLETED")).toBe(true);
  });

  it("persists FAILED durably when execution throws, never leaving RUNNING", async () => {
    const failing: PatternDataProvider = {
      loadInput: async () => { throw new Error("synthetic detector failure"); },
      readWatermarks: async () => BASE_WATERMARKS,
    };
    const worker = new PatternWorker(db as never, failing);
    await expect(
      worker.run(job(), { metrics, logger, idempotencyProvider: locks })
    ).rejects.toThrow("synthetic detector failure");
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0]!.status).toBe("FAILED");
    expect(db.runs[0]!.error).toContain("synthetic detector failure");
    expect(db.runs[0]!.computedAt).toBeTruthy();
    expect(db.findings).toHaveLength(0);
  });

  it("a retry after failure can succeed and replaces the FAILED run", async () => {
    let calls = 0;
    const flaky: PatternDataProvider = {
      loadInput: async () => {
        calls++;
        if (calls === 1) throw new Error("transient failure");
        return emptyInput();
      },
      readWatermarks: async () => BASE_WATERMARKS,
    };
    const worker = new PatternWorker(db as never, flaky);
    await expect(
      worker.run(job(), { metrics, logger, idempotencyProvider: locks })
    ).rejects.toThrow("transient failure");
    expect(db.runs[0]!.status).toBe("FAILED");
    const retry = await worker.run(job(), { metrics, logger, idempotencyProvider: locks });
    expect(retry.status).toBe("SUCCEEDED");
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0]!.status).toBe("COMPLETED");
    expect(db.runs[0]!.error).toBeNull();
  });

  it("onFailure only marks runs owned by the failing job's correlation id", async () => {
    const { provider } = stubProvider(emptyInput());
    const worker = new PatternWorker(db as never, provider);
    const data = worker.validate(job({ jobCorrelationId: "corr-stale-owner" }));
    const identityKey = worker.getJobIdentity(data);
    db.runs.push({
      id: "run-newer", userId: USER, windowStart: WINDOW.start, windowEnd: WINDOW.end,
      identityKey, inputFingerprint: "fp-newer", status: "RUNNING", state: "pending",
      diagnosticsJson: null, detectorVersion: "1.0.0", configVersion: "api-prototype-1",
      jobCorrelationId: "corr-newer-owner", computedAt: null,
    } as never);
    await worker.onFailure(data, new Error("stale owner failure"));
    const row = db.runs.find((r) => r.id === "run-newer")!;
    expect(row.status).toBe("RUNNING");
    expect(row.error).toBeUndefined();
  });

  it("never imports the AI package in the pattern computation path", () => {
    const importRe = /(?:from\s+["']@repo\/ai["']|import\s*\(\s*["']@repo\/ai["']\s*\))/;
    for (const file of ["pattern-worker.ts", "data-provider.ts", "prisma-provider.ts"]) {
      const text = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(text).not.toMatch(importRe);
    }
  });
});
