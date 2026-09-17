import type { PatternEvidenceRef, PatternReliability } from "@repo/types";
import { configureDetectorCatalogEntry, type DetectorIdentity } from "./catalog";
import type { PatternPromotionInput } from "./promotion";

export const fixtureWindow = { start: "2026-09-01T00:00:00Z", end: "2026-09-15T00:00:00Z" };
export const fixtureThresholds = {
  minimumComparableOccasions: 3,
  minimumDistinctDays: 3,
  minimumCoverageRatio: 0.8,
  maximumUnknownFraction: 0.2,
  minimumBaselineOccasions: 3,
  minimumBaselineDays: 3,
  minimumAbsoluteContrast: 0.1,
};

export const fixtureReliability: PatternReliability = {
  tier: "PROVISIONAL",
  calibrationStatus: "UNVALIDATED_PROTOTYPE",
  evidenceQualityFactors: {
    qualifyingDayCount: 3, qualifyingEpisodeCount: 3, meanTelemetryCoverageRatio: 0.9,
    temporalVariability: null, baselineMaturityDays: 3, hasCorroboratingSelfReport: false,
  },
};

export function fixtureEvidence(): PatternEvidenceRef[] {
  return [1, 2, 3].map((n) => ({
    occasionId: `occasion-${n}`, date: `2026-09-0${n}`,
    window: { start: `2026-09-0${n}T10:00:00Z`, end: `2026-09-0${n}T11:00:00Z` },
    blockIds: [`block-${n}`], sessionIds: [`session-${n}`], taskIds: ["task-1"], reportIds: [],
  }));
}

export function fixturePattern(identity: DetectorIdentity = "task_execution_fragmentation", resultId = "result-1"): PatternPromotionInput {
  const entry = configureDetectorCatalogEntry(identity, fixtureThresholds);
  const referenceKind = identity === "schedule_variance" ? "declared-intention" : "own-history";
  const claimLevel = identity === "schedule_variance" ? "recurrence" : identity === "context_switching_density" ? "co-occurrence" : "sustained-change";
  const output = {
    metadata: { evaluationId: "evaluation-1", patternId: `pattern-${resultId}`, detectorVersion: "1", configurationVersion: "1", generatedAt: fixtureWindow.end },
    userId: "user-1", patternType: identity, detectorIdentity: identity, resultId,
    role: identity === "context_switching_density" ? "contributor" : "primary",
    taxonomy: "context_dynamics", executionStatus: "DETECTED", level: "PATTERN", attributionMode: "TASK_LINKED",
    temporalWindow: { ...fixtureWindow, scale: "14_DAY" },
    sample: { qualifyingDays: 3, qualifyingEpisodes: 3, totalObservedHours: 3, meanCoverageRatio: 0.9 },
    baseline: { strategy: "PERSONAL_30_DAY", comparedMetric: "gapMix", baselineValue: 0.2, currentValue: 0.4, deltaRatio: 1, comparisonStatus: "EVALUATED" },
    metrics: { gapMix: 0.4 }, reliability: structuredClone(fixtureReliability),
    evidenceReferences: { contributingSessionIds: ["session-1", "session-2", "session-3"], sampleBoundingWindows: [fixtureWindow] },
    epistemicCaveats: [], claim: "Recorded returns were separated by a different mix of gaps.", claimLevel,
    repertoireCategory: identity === "schedule_variance" ? "mismatch" : "changed",
    comparison: { referenceKind, window: { start: "2026-08-01T00:00:00Z", end: "2026-09-01T00:00:00Z" }, comparabilityNote: "Returns to the same linked task." },
    eligibility: { required: { ...fixtureThresholds }, observed: {}, excluded: [] },
    contributingResults: [{ detectorIdentity: identity, resultId, metricsUsed: ["gapMix"], role: identity === "context_switching_density" ? "supporting" : "primary" }],
    evidenceRefs: fixtureEvidence(), caveats: ["Unobserved work is excluded."],
    qualification: {
      validity: Object.fromEntries(entry.eligibility.requiredValidityFlags.map((flag) => [flag, true])),
      context: { kind: entry.eligibility.requiredContext, key: "task-1", description: "Recorded occasions linked to the same task." },
      contrast: { size: 0.2, direction: "increased" }, unknownFraction: 0.1,
      baselineSample: { comparableOccasions: 3, distinctDays: 3 }, userQuestion: entry.userQuestions[0]!,
      gapCategories: ["other_task", "break", "explained"],
    },
  };
  return output as PatternPromotionInput;
}

export interface FixtureStore {
  occasions: Set<string>;
  blocks: Set<string>;
  sessions: Set<string>;
  tasks: Set<string>;
  reports: Set<string>;
}

export function fixtureStore(): FixtureStore {
  return {
    occasions: new Set(["occasion-1", "occasion-2", "occasion-3"]),
    blocks: new Set(["block-1", "block-2", "block-3"]),
    sessions: new Set(["session-1", "session-2", "session-3"]),
    tasks: new Set(["task-1"]), reports: new Set(["reflection-1", "reflection-2", "outcome-1"]),
  };
}

export function resolveFixtureEvidence(refs: readonly PatternEvidenceRef[], store: FixtureStore): boolean {
  return refs.every((ref) => store.occasions.has(ref.occasionId) &&
    ref.blockIds.every((id) => store.blocks.has(id)) && ref.sessionIds.every((id) => store.sessions.has(id)) &&
    ref.taskIds.every((id) => store.tasks.has(id)) && ref.reportIds.every((id) => store.reports.has(id)));
}
