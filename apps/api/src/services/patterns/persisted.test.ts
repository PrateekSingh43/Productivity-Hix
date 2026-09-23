import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

process.env.NODE_ENV = "test";
process.env.ALLOW_DEV_AUTH = "true";
import { resetTestDb, setTestDb } from "../../lib/prisma";

const userId = "user-patterns-persisted";
const auth = { "x-user-id": userId };

function patternResult(patternId: string) {
  return {
    metadata: { evaluationId: "eval-1", patternId, detectorVersion: "1.0.0", configurationVersion: "api-prototype-1", generatedAt: "2026-09-15T00:00:00.000Z" },
    userId,
    detectorIdentity: "extended_continuous_activity",
    patternType: "extended_continuous_activity",
    taxonomy: "sustained_effort",
    executionStatus: "DETECTED",
    level: "PATTERN",
    attributionMode: "TASK_LINKED",
    temporalWindow: { start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z", scale: "14_DAY" },
    sample: { qualifyingEpisodes: 3, qualifyingDays: 3, totalObservedHours: 5, meanCoverageRatio: 0.9 },
    baseline: { strategy: "PERSONAL_30_DAY", comparedMetric: "observedDurationSeconds", baselineValue: 1800, currentValue: 3600, deltaRatio: 1, comparisonStatus: "EVALUATED" },
    metrics: {},
    reliability: { tier: "PROVISIONAL", calibrationStatus: "UNVALIDATED_PROTOTYPE", evidenceQualityFactors: { qualifyingDayCount: 3, qualifyingEpisodeCount: 3, meanTelemetryCoverageRatio: 0.9, temporalVariability: null, baselineMaturityDays: 30, hasCorroboratingSelfReport: false } },
    evidenceReferences: { sampleBoundingWindows: [{ start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z" }] },
    epistemicCaveats: [],
    claim: "Recorded work stretches were longer than before",
    claimLevel: "sustained-change",
    repertoireCategory: "changed",
    headline: "Recorded work stretches were longer than before",
    supportingLine: "Across comparable recorded occasions, the longest observed stretches were longer than in your earlier records.",
    evidenceAnchor: "3 comparable occasions across 3 days",
    comparison: { referenceKind: "own-history", window: { start: "2026-08-02T00:00:00.000Z", end: "2026-09-01T00:00:00.000Z" }, comparabilityNote: "Closed manual sessions explicitly linked to the same task." },
    eligibility: { required: {}, observed: {}, excluded: [] },
    contributingResults: [],
    evidenceRefs: [],
    caveats: [],
  };
}

afterEach(resetTestDb);

describe("persisted pattern reads", () => {
  it("returns pending when no analysis run exists for the window", async () => {
    setTestDb({
      patternAnalysisRun: { findFirst: async () => null },
      patternFinding: { findMany: async () => [] },
    });
    const res = await request(createApp())
      .get("/api/patterns?from=2026-09-01&to=2026-09-15")
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("pending");
    expect(res.body.patterns).toEqual([]);
    expect(res.body.window).toEqual({ start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z" });
  });

  it("returns persisted patterns and diagnostics from the completed run", async () => {
    const run = {
      id: "run-1",
      state: "ok",
      diagnosticsJson: {
        perDetector: [{ identity: "extended_continuous_activity", status: "PROMOTED", eligibleOccasions: 3, eligibleDays: 3, meanCoverageRatio: 0.9 }],
        recordingHistory: { firstObservationAt: "2026-08-01T00:00:00.000Z", lastObservationAt: "2026-09-14T00:00:00.000Z", recordedDays: 20, connected: true },
      },
    };
    const stored = patternResult("pattern-abc");
    setTestDb({
      patternAnalysisRun: { findFirst: async () => run },
      patternFinding: { findMany: async () => [{ id: "f-1", resultJson: stored }] },
    });
    const res = await request(createApp())
      .get("/api/patterns?from=2026-09-01&to=2026-09-15")
      .set(auth);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("ok");
    expect(res.body.patterns).toHaveLength(1);
    expect(res.body.patterns[0].metadata.patternId).toBe("pattern-abc");
    expect(res.body.patterns[0].claim).toContain("longer than before");
    expect(res.body.diagnostics.perDetector).toHaveLength(1);
    expect(res.body.diagnostics.recordingHistory.recordedDays).toBe(20);
  });
});

describe("pattern analysis producer", () => {
  it("enqueues an outbox event and returns 202", async () => {
    const created: Array<Record<string, unknown>> = [];
    setTestDb({
      outboxEvent: { create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: "evt-1", ...data }; } },
    });
    const res = await request(createApp())
      .post("/api/patterns/analyze")
      .set(auth)
      .send({ from: "2026-09-01", to: "2026-09-15" });
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(true);
    expect(res.body.window).toEqual({ start: "2026-09-01T00:00:00.000Z", end: "2026-09-15T00:00:00.000Z" });
    expect(res.body.correlationId).toBeTruthy();
    expect(created).toHaveLength(1);
    expect(created[0]!.eventType).toBe("pattern.analysis.requested");
    expect(created[0]!.aggregateId).toBe(userId);
    const payload = created[0]!.payload as Record<string, unknown>;
    expect(payload.userId).toBe(userId);
    expect(payload.reason).toBe("MANUAL_TRIGGER");
  });

  it("rejects unknown detectors with 400", async () => {
    setTestDb({ outboxEvent: { create: async () => ({}) } });
    const res = await request(createApp())
      .post("/api/patterns/analyze")
      .set(auth)
      .send({ from: "2026-09-01", to: "2026-09-15", targetDetectors: ["nope"] });
    expect(res.status).toBe(400);
  });

  it("rejects invalid windows with 400", async () => {
    setTestDb({ outboxEvent: { create: async () => ({}) } });
    const res = await request(createApp())
      .post("/api/patterns/analyze")
      .set(auth)
      .send({ from: "bad", to: "2026-09-15" });
    expect(res.status).toBe(400);
  });
});
