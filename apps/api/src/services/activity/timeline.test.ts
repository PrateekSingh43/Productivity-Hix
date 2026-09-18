import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { setTestDb, resetTestDb } from "../../lib/prisma";

const DEV_USER = "00000000-0000-0000-0000-000000000001";

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "act-1",
    externalId: "ext-1",
    bucketId: "b1",
    source: "desktop",
    watcher: "active_window",
    timestamp: new Date(Date.UTC(2026, 8, 1, 10, 0, 0)),
    duration: 18 * 60,
    data: {
      application: "Code.exe",
      windowTitle: "timeline.ts - ProductiveHix - Visual Studio Code",
    },
    ...overrides,
  };
}

function dbFor(rows: unknown[]) {
  const storedBlocks: Array<Record<string, unknown>> = [];
  const storedClaims: Array<Record<string, unknown>> = [];
  const storedAttention: Array<Record<string, unknown>> = [];
  const storedLinks: Array<Record<string, unknown>> = [];

  const db: any = {
    __storedBlocks: storedBlocks,
    __storedClaims: storedClaims,
    $transaction: vi.fn().mockImplementation(async (callback: (tx: any) => Promise<any>) => callback(db)),
    userPreference: { findUnique: vi.fn().mockResolvedValue(null) },
    normalizedActivity: { findMany: vi.fn().mockResolvedValue(rows) },
    userActivityRule: { findMany: vi.fn().mockResolvedValue([]) },
    userActivityOverride: { findMany: vi.fn().mockResolvedValue([]) },
    task: { findMany: vi.fn().mockResolvedValue([]) },
    dailyGoal: { findMany: vi.fn().mockResolvedValue([]) },
    workSession: { findMany: vi.fn().mockResolvedValue([]) },
    desktopDevice: { findFirst: vi.fn().mockResolvedValue(null) },
    temporalActivityBlock: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockImplementation(() =>
        Promise.resolve(
          storedBlocks.map((b) => ({
            ...b,
            claims: storedClaims.filter((c) => c.blockId === b.id),
            attentionInferences: storedAttention.filter((a) => a.blockId === b.id),
            contextLinks: storedLinks.filter((l) => l.blockId === b.id),
          }))
        )
      ),
      create: vi.fn().mockImplementation(({ data }) => {
        const row = { id: `blk-${storedBlocks.length + 1}`, ...data };
        storedBlocks.push(row);
        return Promise.resolve(row);
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    blockObservation: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    semanticClaim: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockImplementation(({ data }) => {
        const row = { id: `claim-${storedClaims.length + 1}`, ...data };
        storedClaims.push(row);
        return Promise.resolve(row);
      }),
    },
    activityContextLink: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockImplementation(({ data }) => {
        const row = { id: `link-${storedLinks.length + 1}`, ...data };
        storedLinks.push(row);
        return Promise.resolve(row);
      }),
    },
    claimEvidence: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
    attentionInference: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockImplementation(({ data }) => {
        const row = { id: `att-${storedAttention.length + 1}`, ...data };
        storedAttention.push(row);
        return Promise.resolve(row);
      }),
    },
    telemetryCoverageGap: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
  };

  return db;
}

beforeEach(() => {
  vi.stubEnv("ALLOW_DEV_AUTH", "true");
});

afterEach(() => {
  resetTestDb();
  vi.unstubAllEnvs();
});

describe("GET /api/activity/timeline semantic blocks", () => {
  it("returns legacy fields plus semantic blocks materialized from telemetry", async () => {
    const db = dbFor([rawRow()]);
    setTestDb(db);

    const response = await request(createApp())
      .get("/api/activity/timeline")
      .query({ date: "2026-09-01", timezone: "UTC" })
      .set("x-user-id", DEV_USER);

    expect(response.status).toBe(200);
    expect(response.body.segments).toBeDefined();
    expect(response.body.blocks).toBeDefined();
    expect(response.body.blocks.length).toBeGreaterThan(0);
    const block = response.body.blocks[0];
    expect(block.startTime).toBeDefined();
    expect(block.endTime).toBeDefined();
    expect(block.wallClockDurationMs).toBe(18 * 60 * 1000);
    expect(block.primaryApplication).toBe("Code.exe");
    expect(block.modality.primary).toEqual(
      expect.objectContaining({ value: "development", provenance: "CONTEXT_HEURISTIC" })
    );
    expect(db.temporalActivityBlock.create).toHaveBeenCalled();
  });

  it("returns empty blocks for a day without telemetry", async () => {
    setTestDb(dbFor([]));

    const response = await request(createApp())
      .get("/api/activity/timeline")
      .query({ date: "2026-09-01", timezone: "UTC" })
      .set("x-user-id", DEV_USER);

    expect(response.status).toBe(200);
    expect(response.body.blocks).toEqual([]);
  });
});
