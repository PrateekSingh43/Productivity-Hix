/**
 * Real-Postgres API boundary tests (§37 HTTP half).
 *
 * POST /api/patterns/analyze writes a real outbox row attributed to the
 * authenticated user; GET /api/patterns reads real run/finding rows with
 * strict per-user isolation. Skips when DATABASE_URL is unreachable.
 */
import { configDotenv } from "dotenv";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../../app";
import { getDb } from "../../lib/prisma";

configDotenv({ path: new URL("../../../.env", import.meta.url) });

process.env.NODE_ENV = "test";
process.env.ALLOW_DEV_AUTH = "true";

const hasDb = Boolean(process.env.DATABASE_URL);
const WINDOW = { from: "2026-09-01", to: "2026-09-15" };
const createdUsers: string[] = [];
let dbReachable = false;

describe.skipIf(!hasDb)("pattern API real-postgres boundary", () => {
  beforeAll(async () => {
    try {
      await getDb().$queryRaw`SELECT 1`;
      dbReachable = true;
    } catch {
      dbReachable = false;
    }
  }, 30_000);

  afterAll(async () => {
    if (!dbReachable) return;
    await getDb().user.deleteMany({ where: { id: { in: createdUsers } } });
  });

  it("analyze writes a user-attributed outbox row; reads isolate users", async () => {
    if (!dbReachable) return;
    const db = getDb();
    const userA = randomUUID();
    const userB = randomUUID();
    await db.user.createMany({ data: [{ id: userA }, { id: userB }] });
    createdUsers.push(userA, userB);
    const app = createApp();

    const post = await request(app)
      .post("/api/patterns/analyze")
      .set({ "x-user-id": userA })
      .send({ ...WINDOW });
    expect(post.status).toBe(202);
    const outbox = await db.outboxEvent.findFirst({
      where: { aggregateId: userA, eventType: "pattern.analysis.requested" },
      orderBy: { createdAt: "desc" },
    });
    expect(outbox).toBeTruthy();
    expect((outbox!.payload as Record<string, unknown>).userId).toBe(userA);

    // Seed a completed run + finding for A directly (worker path proven separately).
    const run = await db.patternAnalysisRun.create({
      data: {
        userId: userA,
        windowStart: new Date("2026-09-01T00:00:00.000Z"),
        windowEnd: new Date("2026-09-15T00:00:00.000Z"),
        identityKey: `test-${randomUUID()}`,
        inputFingerprint: "fp",
        status: "COMPLETED",
        state: "no-findings",
        detectorVersion: "1.0.0",
        configVersion: "api-prototype-1",
        diagnosticsJson: { perDetector: [] },
        computedAt: new Date(),
      },
    });

    const getA = await request(app)
      .get(`/api/patterns?from=${WINDOW.from}&to=${WINDOW.to}`)
      .set({ "x-user-id": userA });
    expect(getA.status).toBe(200);
    expect(getA.body.runStatus).toBe("COMPLETED");
    expect(getA.body.runId).toBe(run.id);

    // B sees none of A's state despite identical window.
    const getB = await request(app)
      .get(`/api/patterns?from=${WINDOW.from}&to=${WINDOW.to}`)
      .set({ "x-user-id": userB });
    expect(getB.status).toBe(200);
    expect(getB.body.runStatus).toBe("NO_RUN");
    expect(getB.body.patterns).toEqual([]);
    expect(JSON.stringify(getB.body)).not.toContain(run.id);
  }, 60_000);
});
