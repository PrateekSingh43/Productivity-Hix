/**
 * Level 5: Pattern vertical slice (Redis-free).
 *
 * outbox row (as written by POST /api/patterns/analyze)
 *   -> OutboxPublisher.dispatchEvent (direct PatternWorker execution)
 *   -> durable PatternAnalysisRun + PatternFinding rows shaped exactly as
 *      GET /api/patterns (getPersistedPatterns) consumes them.
 */
import { describe, it, expect } from "vitest";
import { OutboxPublisher } from "../outbox/publisher";
import { InMemoryLockProvider } from "../base/idempotency";
import { MemoryWorkerMetricsCollector } from "../shared/metrics";
import { MemoryWorkerLogger } from "../shared/logging";
import { PatternWorker } from "./pattern-worker";
import type { PatternDataProvider } from "./data-provider";
import type { PatternPipelineInput } from "@repo/analytics";

const USER = "user-vertical-slice";
const WINDOW = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z" };

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

function createFakeDb() {
  const runs: any[] = [];
  const findings: any[] = [];
  let ids = 0;
  const db: any = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    runs,
    findings,
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === USER ? { id: USER } : null,
    },
    patternAnalysisRun: {
      findFirst: async ({ where }: any) =>
        runs.filter((r) => Object.entries(where).every(([k, v]) => (r as any)[k] === v)).slice(-1)[0] ?? null,
      create: async ({ data }: any) => { const row = { id: `run-${++ids}`, computedAt: null, ...data }; runs.push(row); return row; },
      update: async ({ where, data }: any) => { const row = runs.find((r) => r.id === where.id)!; Object.assign(row, data); return row; },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of runs) {
          if (Object.entries(where).every(([k, v]) => (row as any)[k] === v)) {
            Object.assign(row, data);
            count++;
          }
        }
        return { count };
      },
    },
    patternFinding: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        findings.filter((f) => Object.entries(where).every(([k, v]) => k === "select" || f[k] === v)),
      count: async ({ where }: { where: Record<string, unknown> }) =>
        findings.filter((f) => Object.entries(where).every(([k, v]) => f[k] === v)).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `finding-${++ids}`, ...data };
        findings.push(row);
        return row;
      },
    },
    outboxEvent: {
      update: async () => ({}),
    },
  };
  return db;
}

describe("Pattern vertical slice", () => {
  it("producer outbox row -> direct worker -> durable rows readable by the API contract", async () => {
    const db = createFakeDb();

    // 1. Producer: exactly what POST /api/patterns/analyze writes.
    const jobCorrelationId = "corr-vertical-1";
    const queuedAt = new Date().toISOString();
    const outboxRow: any = {
      id: "outbox-vertical-1",
      eventType: "pattern.analysis.requested",
      aggregateType: "pattern",
      aggregateId: USER,
      payload: {
        userId: USER,
        windowStart: WINDOW.start,
        windowEnd: WINDOW.end,
        reason: "MANUAL_TRIGGER",
        jobCorrelationId,
        queuedAt,
      },
      correlationId: jobCorrelationId,
      causationId: null,
      schemaVersion: "1.0.0",
      occurredAt: new Date(),
      createdAt: new Date(),
      publicationAttemptCount: 0,
      maxAttempts: 5,
    };

    // 2. Publisher executes the envelope directly through real BaseWorker semantics.
    const provider: PatternDataProvider = {
      loadInput: async () => emptyInput(),
      readWatermarks: async () => ({
        maxSourceAt: WINDOW.end,
        activityCount: 0,
        activityDurationSum: 0,
        sessionCount: 0,
        checkInCount: 0,
        taskCount: 0,
      }),
    };
    const worker = new PatternWorker(db as never, provider);
    const publisher = new OutboxPublisher({
      db: db as any,
      patternWorker: worker as never,
      locks: new InMemoryLockProvider(),
      metrics: new MemoryWorkerMetricsCollector(),
      logger: new MemoryWorkerLogger(),
    });
    expect(await publisher.dispatchEvent(outboxRow)).toBe(true);

    // 3. Durable rows match the GET /api/patterns read contract.
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0].status).toBe("COMPLETED");
    expect(db.runs[0].state).toBe("not-connected");
    expect(db.runs[0].windowStart).toBe(WINDOW.start);
    const apiView = {
      state: db.runs[0].state,
      window: WINDOW,
      patterns: db.findings.map((f: any) => f.resultJson),
      diagnostics: db.runs[0].diagnosticsJson,
    };
    expect(apiView.patterns).toEqual([]);
    expect(apiView.diagnostics.perDetector).toEqual(
      expect.arrayContaining([expect.objectContaining({ identity: "extended_continuous_activity" })])
    );
  });
});
