/**
 * Phase 6 AI evidence envelope.
 *
 * The single typed boundary between deterministic analytics and any future
 * LLM call. An envelope carries ONLY allowlisted analytical summaries —
 * never raw telemetry rows, never evidence identifiers, never free-text
 * fields that could smuggle raw observations (titles, notes, blockers).
 * Any future AI integration must accept this type (not InsightOutput) so
 * the "AI never receives raw telemetry" invariant is enforced by the
 * compiler instead of by convention.
 */
import type { InsightOutput } from "@repo/types";

export interface InsightEvidenceEnvelope {
  version: "insight-envelope-v1";
  window: { start: string; end: string };
  claim: string;
  claimLevel: InsightOutput["claimLevel"];
  headline: string | null;
  supportingLine: string | null;
  patternIds: string[];
  personalElementKinds: Array<"intention" | "reflection" | "outcome" | "retention">;
  personalElementCount: number;
  evidenceOccasionCount: number;
  evidenceDayCount: number;
  alternatives: string[];
  doesNotEstablish: string[];
  hypothesis: {
    adjustment: string;
    intendedBenefit: string;
    potentialCost: string;
    reviewAfter: string;
  } | null;
}

const FORBIDDEN_KEYS = [
  "blockIds",
  "sessionIds",
  "taskIds",
  "reportIds",
  "rawData",
  "raw_data",
  "windowTitle",
  "window_title",
  "application",
  "durationMs",
  "duration_ms",
  "timestamp",
  "note",
  "blocker",
  "title",
];

/**
 * Builds the AI-safe envelope for one composed insight. Throws when the
 * input carries no claim (fail closed — never send an empty prompt).
 */
export function buildInsightEnvelope(insight: InsightOutput): InsightEvidenceEnvelope {
  if (!insight.claim || !insight.claim.trim()) {
    throw new Error("Cannot build an AI envelope for an insight without a claim.");
  }
  const patternIds = [
    ...new Set(
      insight.inputs.flatMap((ref) => ("patternId" in ref && ref.patternId ? [ref.patternId] : []))
    ),
  ].sort();
  const dates = [
    ...new Set((insight.evidenceRefs ?? []).map((ref) => ref.date).filter(Boolean)),
  ].sort();
  return {
    version: "insight-envelope-v1",
    window: { start: insight.window.start, end: insight.window.end },
    claim: insight.claim,
    claimLevel: insight.claimLevel,
    headline: insight.headline ?? null,
    supportingLine: insight.supportingLine ?? null,
    patternIds,
    personalElementKinds: [
      ...new Set((insight.personalElements ?? []).map((el) => el.kind)),
    ].sort(),
    personalElementCount: (insight.personalElements ?? []).length,
    evidenceOccasionCount: (insight.evidenceRefs ?? []).length,
    evidenceDayCount: dates.length,
    alternatives: [...(insight.alternatives ?? [])],
    doesNotEstablish: [...(insight.doesNotEstablish ?? [])],
    hypothesis: insight.hypothesis
      ? {
          adjustment: insight.hypothesis.adjustment,
          intendedBenefit: insight.hypothesis.intendedBenefit,
          potentialCost: insight.hypothesis.potentialCost,
          reviewAfter: insight.hypothesis.reviewAfter,
        }
      : null,
  };
}

/**
 * Test hook: asserts a serialized envelope contains no raw-telemetry-shaped
 * keys. Used by envelope.test.ts; exported so API-side callers can guard
 * future envelope versions the same way.
 */
export function assertEnvelopeHasNoRawTelemetry(envelope: unknown): void {
  const serialized = JSON.stringify(envelope ?? {});
  const hits = FORBIDDEN_KEYS.filter((key) => serialized.includes(`"${key}"`));
  if (hits.length > 0) {
    throw new Error(`AI envelope leaks raw-telemetry keys: ${hits.join(", ")}`);
  }
}
