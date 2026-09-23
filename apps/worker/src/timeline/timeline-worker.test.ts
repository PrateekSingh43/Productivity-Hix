import { describe, it, expect, beforeEach, vi } from "vitest";
import { PRODUCTIVEHIX_QUEUES } from "@repo/types";
import { WorkerValidationError } from "../base/errors";
import { TimelineWorker } from "./timeline-worker";
import { createWorkerExecutionContext, type WorkerExecutionContext } from "../base/context";

const USER = "user-timeline-test";
const DATE = "2026-09-23";

function createMockContext(): WorkerExecutionContext {
  return createWorkerExecutionContext({
    jobId: "job-123",
    queueName: "test-queue",
    correlationId: "corr-123",
    attempt: 1,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any,
  });
}

function createFakeDb() {
  const dayStates = new Map<string, any>();
  const dayStatesById = new Map<string, any>();
  const snapshots: any[] = [];
  const outboxEvents: any[] = [];
  const normalizedActivities: any[] = [];
  const blocks: any[] = [];

  const key = (u: string, d: string) => `${u}:${d}`;

  const setDayState = (u: string, d: string, state: any) => {
    const s = { id: state.id || `state-${dayStates.size + 1}`, userId: u, localDate: d, ...state };
    dayStates.set(key(u, d), s);
    dayStatesById.set(s.id, s);
    return s;
  };

  const db: any = {
    userPreference: {
      findUnique: vi.fn().mockResolvedValue({ timezone: "UTC" }),
    },
    timelineDayState: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where.id) return dayStatesById.get(where.id) || null;
        const u = where.userId_localDate?.userId;
        const d = where.userId_localDate?.localDate;
        return dayStates.get(key(u, d)) || null;
      }),
      upsert: vi.fn().mockImplementation(async ({ where, create, update }: any) => {
        const u = where.userId_localDate?.userId;
        const d = where.userId_localDate?.localDate;
        const existing = dayStates.get(key(u, d));
        if (existing) {
          const updated = { ...existing, ...update };
          dayStates.set(key(u, d), updated);
          dayStatesById.set(updated.id, updated);
          return updated;
        }
        return setDayState(u, d, create);
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        let existing = where.id ? dayStatesById.get(where.id) : null;
        if (!existing) {
          const u = where.userId_localDate?.userId;
          const d = where.userId_localDate?.localDate;
          existing = dayStates.get(key(u, d));
        }
        const updated = { ...(existing || {}), ...data };
        if (updated.userId && updated.localDate) {
          dayStates.set(key(updated.userId, updated.localDate), updated);
        }
        if (updated.id) {
          dayStatesById.set(updated.id, updated);
        }
        return updated;
      }),
    },
    normalizedActivity: {
      findMany: vi.fn().mockImplementation(async () => normalizedActivities),
    },
    timelineRuleOverride: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userActivityRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userActivityOverride: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    timelineSnapshot: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const snap = { id: `snap-${snapshots.length + 1}`, ...data };
        snapshots.push(snap);
        return snap;
      }),
    },
    temporalActivityBlock: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const b = { id: `block-${blocks.length + 1}`, ...data };
        blocks.push(b);
        return b;
      }),
    },
    temporalBlockClaim: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    temporalBlockContextClaim: {
      create: vi.fn().mockResolvedValue({ id: "ctx-1" }),
    },
    temporalBlockIntentLink: {
      create: vi.fn().mockResolvedValue({ id: "link-1" }),
    },
    temporalBlockAttention: {
      create: vi.fn().mockResolvedValue({ id: "att-1" }),
    },
    outboxEvent: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const evt = { id: `evt-${outboxEvents.length + 1}`, ...data };
        outboxEvents.push(evt);
        return evt;
      }),
    },
    $transaction: vi.fn().mockImplementation(async (callback: any) => {
      return callback(db);
    }),
  };

  return {
    db,
    dayStates,
    dayStatesById,
    setDayState,
    snapshots,
    outboxEvents,
    normalizedActivities,
    blocks,
  };
}

describe("TimelineWorker", () => {
  let fake: ReturnType<typeof createFakeDb>;
  let worker: TimelineWorker;
  let ctx: WorkerExecutionContext;

  beforeEach(() => {
    fake = createFakeDb();
    worker = new TimelineWorker(fake.db);
    ctx = createMockContext();
  });

  describe("Validation", () => {
    it("validates a direct job payload correctly", () => {
      const validated = worker.validate({
        userId: USER,
        localDate: DATE,
        requestedRevision: {
          observationRevision: 2,
          ruleRevision: 1,
          semanticVersion: "3b.0.1",
        },
      });

      expect(validated.userId).toBe(USER);
      expect(validated.localDate).toBe(DATE);
      expect(validated.requestedRevision.observationRevision).toBe(2);
      expect(validated.requestedRevision.ruleRevision).toBe(1);
    });

    it("validates a DomainEventEnvelope payload correctly", () => {
      const envelope = {
        eventId: "evt-123",
        eventType: "telemetry.ingested",
        timestamp: "2026-09-23T12:00:00Z",
        correlationId: "corr-xyz",
        sourceService: "api",
        schemaVersion: "1.0",
        payload: {
          userId: USER,
          localDate: DATE,
          revision: { observationRevision: 5, ruleRevision: 0 },
        },
      };

      const validated = worker.validate(envelope);
      expect(validated.userId).toBe(USER);
      expect(validated.localDate).toBe(DATE);
      expect(validated.requestedRevision.observationRevision).toBe(5);
      expect(validated.jobCorrelationId).toBe("corr-xyz");
    });

    it("throws WorkerValidationError on invalid payloads", () => {
      expect(() => worker.validate(null)).toThrow(WorkerValidationError);
      expect(() => worker.validate({})).toThrow(WorkerValidationError);
      expect(() => worker.validate({ userId: USER })).toThrow(WorkerValidationError);
    });
  });

  describe("Idempotency", () => {
    it("returns null if DayState does not exist", async () => {
      const isIdempotent = await worker.checkIdempotency({
        userId: USER,
        localDate: DATE,
        reason: "TELEMETRY_INGEST",
        requestedRevision: { observationRevision: 1, ruleRevision: 0, semanticVersion: "3b.0.1" },
        jobCorrelationId: "corr-1",
        queuedAt: new Date().toISOString(),
      });

      expect(isIdempotent).toBeNull();
    });

    it("returns existing result if DayState is READY with matched revisions and activeSnapshotId", async () => {
      fake.setDayState(USER, DATE, {
        status: "READY",
        activeSnapshotId: "snap-existing",
        currentObservationRevision: 2,
        currentRuleRevision: 1,
        materializedObservationRevision: 2,
        materializedRuleRevision: 1,
      });

      const isIdempotent = await worker.checkIdempotency({
        userId: USER,
        localDate: DATE,
        reason: "TELEMETRY_INGEST",
        requestedRevision: { observationRevision: 2, ruleRevision: 1, semanticVersion: "3b.0.1" },
        jobCorrelationId: "corr-1",
        queuedAt: new Date().toISOString(),
      });

      expect(isIdempotent).not.toBeNull();
      expect(isIdempotent?.status).toBe("READY");
      expect(isIdempotent?.snapshotId).toBe("snap-existing");
    });

    it("returns null if DayState is STALE even with activeSnapshotId", async () => {
      fake.setDayState(USER, DATE, {
        status: "STALE",
        activeSnapshotId: "snap-existing",
        currentObservationRevision: 3,
        currentRuleRevision: 1,
        materializedObservationRevision: 2,
        materializedRuleRevision: 1,
      });

      const isIdempotent = await worker.checkIdempotency({
        userId: USER,
        localDate: DATE,
        reason: "TELEMETRY_INGEST",
        requestedRevision: { observationRevision: 3, ruleRevision: 1, semanticVersion: "3b.0.1" },
        jobCorrelationId: "corr-1",
        queuedAt: new Date().toISOString(),
      });

      expect(isIdempotent).toBeNull();
    });
  });

  describe("Pre-execution supersession", () => {
    it("returns true if DayState already materialized higher observation revision", async () => {
      fake.setDayState(USER, DATE, {
        materializedObservationRevision: 5,
        materializedRuleRevision: 1,
      });

      const isSuperseded = await worker.checkSuperseded(
        {
          userId: USER,
          localDate: DATE,
          reason: "TELEMETRY_INGEST",
          requestedRevision: { observationRevision: 3, ruleRevision: 1, semanticVersion: "3b.0.1" },
          jobCorrelationId: "corr-1",
          queuedAt: new Date().toISOString(),
        },
        ctx
      );

      expect(isSuperseded).toBe(true);
    });

    it("returns false if DayState has lower or equal revision", async () => {
      fake.setDayState(USER, DATE, {
        materializedObservationRevision: 2,
        materializedRuleRevision: 0,
      });

      const isSuperseded = await worker.checkSuperseded(
        {
          userId: USER,
          localDate: DATE,
          reason: "TELEMETRY_INGEST",
          requestedRevision: { observationRevision: 3, ruleRevision: 0, semanticVersion: "3b.0.1" },
          jobCorrelationId: "corr-1",
          queuedAt: new Date().toISOString(),
        },
        ctx
      );

      expect(isSuperseded).toBe(false);
    });
  });

  describe("Execution & Durable Snapshot Activation", () => {
    it("executes cleanly on empty activity and creates an active snapshot", async () => {
      const result = await worker.execute(
        {
          userId: USER,
          localDate: DATE,
          reason: "TELEMETRY_INGEST",
          requestedRevision: { observationRevision: 1, ruleRevision: 0, semanticVersion: "3b.0.1" },
          jobCorrelationId: "corr-1",
          queuedAt: new Date().toISOString(),
        },
        ctx
      );

      expect(result.status).toBe("READY");
      expect(result.blockCount).toBe(0);
      expect(result.snapshotId).toBeDefined();

      // Verify snapshot was created with COMPLETE status
      expect(fake.snapshots.length).toBe(1);
      const snapshot = fake.snapshots[0];
      expect(snapshot.status).toBe("COMPLETE");
      expect(snapshot.userId).toBe(USER);
      expect(snapshot.localDate).toBe(DATE);

      // Verify DayState was updated with activeSnapshotId and status READY
      const dayState = fake.dayStates.get(`${USER}:${DATE}`);
      expect(dayState.status).toBe("READY");
      expect(dayState.activeSnapshotId).toBe(snapshot.id);
      expect(dayState.materializedObservationRevision).toBe(1);

      // Verify outbox event emitted
      expect(fake.outboxEvents.length).toBe(1);
      expect(fake.outboxEvents[0].eventType).toBe("timeline.window.materialized");
      expect(fake.outboxEvents[0].payload.snapshotId).toBe(snapshot.id);
    });

    it("materializes raw activity rows into blocks and persists snapshot", async () => {
      fake.normalizedActivities.push(
        {
          id: "act-1",
          timestamp: new Date("2026-09-23T10:00:00Z"),
          duration: 300, // 5 min
          source: "desktop",
          watcher: "window",
          schemaVersion: "1.0",
          data: {
            app: "VS Code",
            title: "timeline-worker.ts — ProductiveHix",
          },
        },
        {
          id: "act-2",
          timestamp: new Date("2026-09-23T10:05:00Z"),
          duration: 300, // 5 min
          source: "desktop",
          watcher: "window",
          schemaVersion: "1.0",
          data: {
            app: "VS Code",
            title: "timeline-worker.test.ts — ProductiveHix",
          },
        }
      );

      const result = await worker.execute(
        {
          userId: USER,
          localDate: DATE,
          reason: "TELEMETRY_INGEST",
          requestedRevision: { observationRevision: 1, ruleRevision: 0, semanticVersion: "3b.0.1" },
          jobCorrelationId: "corr-1",
          queuedAt: new Date().toISOString(),
        },
        ctx
      );

      expect(result.status).toBe("READY");
      expect(result.blockCount).toBeGreaterThanOrEqual(1);

      // Snapshot persisted
      expect(fake.snapshots.length).toBe(1);
      const snap = fake.snapshots[0];
      expect(snap.status).toBe("COMPLETE");
      expect(snap.blockCount).toBe(result.blockCount);
      expect(snap.blocksJson.length).toBe(result.blockCount);

      // Summary includes total tracked duration
      expect(snap.summary.totalTrackedMs).toBeGreaterThan(0);
    });
  });
});
