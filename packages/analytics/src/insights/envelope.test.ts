import { describe, expect, test } from "vitest";
import type { InsightOutput } from "@repo/types";
import { assertEnvelopeHasNoRawTelemetry, buildInsightEnvelope } from "./envelope";

function sampleInsight(): InsightOutput {
  return {
    inputs: [{ patternId: "p-1", role: "primary" }],
    personalElements: [
      { kind: "reflection", recordId: "r-1" },
      { kind: "outcome", recordId: "g-1" },
    ],
    claim: "Late starts co-occur with low reported focus.",
    claimLevel: "co-occurrence",
    alternatives: ["Mornings differ for other reasons."],
    doesNotEstablish: ["Whether one observation caused another."],
    evidenceRefs: [
      {
        occasionId: "occ-1",
        date: "2026-09-20",
        window: { start: "2026-09-20T09:00:00.000Z", end: "2026-09-20T10:00:00.000Z" },
        blockIds: ["b-1"],
        sessionIds: ["s-1"],
        taskIds: ["t-1"],
        reportIds: ["r-1"],
      },
    ],
    status: "DETECTED",
    window: { start: "2026-09-15T00:00:00.000Z", end: "2026-09-29T00:00:00.000Z" },
    reliability: null,
    headline: "Late starts, low focus",
    supportingLine: "Late starts co-occur with low reported focus.",
    hypothesis: {
      adjustment: "Start earlier.",
      intendedBenefit: "Calmer mornings.",
      potentialCost: "Less evening time.",
      reviewAfter: "One week.",
    },
  };
}

describe("insight AI envelope (Phase 6)", () => {
  test("carries analytical summaries, never raw identifiers or rows", () => {
    const envelope = buildInsightEnvelope(sampleInsight());
    expect(envelope.version).toBe("insight-envelope-v1");
    expect(envelope.claim).toContain("Late starts");
    expect(envelope.patternIds).toEqual(["p-1"]);
    expect(envelope.personalElementKinds).toEqual(["outcome", "reflection"]);
    expect(envelope.evidenceOccasionCount).toBe(1);
    expect(envelope.evidenceDayCount).toBe(1);
    expect(() => assertEnvelopeHasNoRawTelemetry(envelope)).not.toThrow();
  });

  test("fails closed on claim-less input", () => {
    expect(() => buildInsightEnvelope({ ...sampleInsight(), claim: "  " })).toThrow(
      /without a claim/
    );
  });

  test("guard catches a leaking envelope", () => {
    expect(() =>
      assertEnvelopeHasNoRawTelemetry({ blockIds: ["b-1"], claim: "x" })
    ).toThrow(/blockIds/);
  });
});
