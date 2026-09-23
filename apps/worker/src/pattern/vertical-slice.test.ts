/**
 * Level 5: Pattern vertical slice.
 *
 * outbox row (as written by POST /api/patterns/analyze)
 *   -> OutboxPublisher.dispatchEvent (real queue validation, mocked BullMQ)
 *   -> DomainEventEnvelope job data
 *   -> PatternWorker.run (real BaseWorker semantics)
 *   -> durable PatternAnalysisRun + PatternFinding rows shaped exactly as
 *      GET /api/patterns (getPersistedPatterns) consumes them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PRODUCTIVEHIX_QUEUES } from "@repo/types";
import { OutboxPublisher } from "../outbox/publisher";
import { QueueManager } from "../runtime/queue";
import { InMemoryLockProvider } from "../base/idempotency";
import { MemoryWorkerMetricsCollector } from "../shared/metrics";
import { MemoryWorkerLogger } from "../shared/logging";
import { PatternWorker } from "./pattern-worker";
import type { PatternDataProvider } from "./data-provider";
import type { PatternPipelineInput } from "@repo/analytics";

const { MockBullQueue, mockQueues } = vi.hoisted(() => {
  const queues = new Map<string, any>();
  class MockBullQueue {
    jobs: any[] = [];
    constructor(public name: string, public options: any) { queues.set(name, this); }
    add = vi.fn().mockImplementation(async (jobName: string, data: any, opts: any) => {
      const job = { id: opts?.jobId ?? "mock-job", name: jobName, data, opts };
      this.jobs.push(job);
      return job;
    });
    close = vi.fn().mockResolvedValue(undefined);
  }
  return { MockBullQueue, mockQueues: queues };
});

vi.mock("bullmq", () => ({
  Queue: MockBullQueue,
  Worker: class MockWorker {
    close = vi.fn().mockResolvedValue(undefined);
    on = vi.fn().mockReturnValue(this);
  },
}));

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
    patternAnalysisRun: {
      findUnique: async ({ where }: any) =>
        runs.find((r) => r.userId === where.userId_identityKey?.userId && r.identityKey === where.userId_identityKey?.identityKey) ?? null,
      findFirst: async () => null,
      create: async ({ data }: any) => { const row = { id: `run-${++ids}`, computedAt: null, ...data }; runs.push(row); return row; },
      update: async ({ where, data }: any) => { const row = runs.find((r) => r.id === where.id)!; Object.assign(row, data); return row; },
      upsert: async ({ where, create, update }: any) => {
        const key = where.userId_identityKey;
        const existing = runs.find((r) => r.userId === key.userId && r.identityKey === key.identityKey);
        if (existing) { Object.assign(existing, update); return existing; }
        const row = { id: `run-${++ids}`, computedAt: null, ...create };
        runs.push(row);
        return row;
      },
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
      findMany: async ({ where }: any) =>
        findings.filter((f) => Object.entries(where).every(([k, v]) => k === "select" || (f as any)[k] === v)),
      count: async ({ where }: any) =>
        findings.filter((f) => Object.entries(where).every(([k, v]) => (f as any)[k] === v)).length,
      upsert: async ({ where, create, update }: any) => {
        const key = where.userId_patternKey;
        const existing = findings.find((f) => f.userId === key.userId && f.patternKey === key.patternKey);
        if (existing) { Object.assign(existing, update); return existing; }
        const row = { id: `finding-${++ids}`, ...create };
        findings.push(row);
        return row;
      },
      delete: async () => ({}),
    },
    outboxEvent: {
      update: async () => ({}),
    },
  };
  return db;
}

describe("Pattern vertical slice", () => {
  beforeEach(() => { mockQueues.clear(); });

  it("producer outbox row -> queue -> worker -> durable rows readable by the API contract", async () => {
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

    // 2. Publisher dispatches through real queue validation (mocked BullMQ transport).
    const queueManager = new QueueManager({ connection: {} as any });
    const publisher = new OutboxPublisher({ db: db as any, queueManager });
    expect(await publisher.dispatchEvent(outboxRow)).toBe(true);
    const queue = mockQueues.get(PRODUCTIVEHIX_QUEUES.PATTERN_ANALYSIS);
    expect(queue.jobs).toHaveLength(1);
    const envelope = queue.jobs[0].data;
    expect(envelope.eventType).toBe("pattern.analysis.requested");
    expect(envelope.payload.userId).toBe(USER);

    // 3. Worker runs the envelope through real BaseWorker semantics.
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
    const result = await worker.run(envelope, {
      metrics: new MemoryWorkerMetricsCollector(),
      logger: new MemoryWorkerLogger(),
      idempotencyProvider: new InMemoryLockProvider(),
    });
    expect(result.status).toBe("SUCCEEDED");

    // 4. Durable rows match the GET /api/patterns read contract.
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
