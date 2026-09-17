import type { AnalyticalWindow, QualifiedBehavioralPatternOutput } from "@repo/types";
import {
  detectorCatalog, getDetectorCatalogEntry, isDetectorIdentity, patternRelationship, validPatternEligibilityThresholds,
  type CatalogPatternIdentity, type DetectorCatalogEntry,
} from "./catalog";
import { generatePatternCopy, isNonCausalClaim, type ContrastDirection, type GapCategory } from "./copy";
import { containsAnalyticalWindow, hasBoundedEvidence, unionPatternEvidence, validAnalyticalWindow } from "./lineage";

export interface PatternQualification {
  validity: Record<string, boolean>;
  context: { kind: DetectorCatalogEntry["eligibility"]["requiredContext"]; key: string; description: string };
  contrast: { size: number; direction: ContrastDirection };
  unknownFraction: number;
  baselineSample: { comparableOccasions: number; distinctDays: number };
  userQuestion: string;
  gapCategories?: GapCategory[];
  assessedOutcomeRecordIds?: string[];
}

export type PatternPromotionInput<TMetrics = Record<string, unknown>> =
  QualifiedBehavioralPatternOutput<TMetrics> & CatalogPatternIdentity & {
    resultId: string;
    qualification: PatternQualification;
  };

export type PatternPromotionReason = {
  status: "INSUFFICIENT_EVIDENCE" | "INSUFFICIENT_BASELINE_DATA" | "NOT_PROMOTED_INTERNAL_ONLY";
  criterion: "catalog" | "validity" | "recurrence" | "context" | "contrast" | "evidence" | "relevance" | "incremental-value";
  detail: string;
};

export type PatternPromotionResult<TMetrics = Record<string, unknown>> =
  | { promoted: true; pattern: PatternPromotionInput<TMetrics> }
  | { promoted: false; reason: PatternPromotionReason };

function reject<T>(
  status: PatternPromotionReason["status"],
  criterion: PatternPromotionReason["criterion"],
  detail: string,
): PatternPromotionResult<T> {
  return { promoted: false, reason: { status, criterion, detail } };
}

export function patternIncrementalKey(pattern: PatternPromotionInput<unknown>): string {
  return JSON.stringify([pattern.userId, pattern.detectorIdentity, pattern.qualification.context.key,
    pattern.claimLevel, pattern.repertoireCategory, pattern.comparison.referenceKind,
    pattern.qualification.contrast, [...(pattern.qualification.gapCategories ?? [])].sort()]);
}

export function promotePattern<TMetrics>(
  output: PatternPromotionInput<TMetrics>,
  entry: DetectorCatalogEntry,
  window: AnalyticalWindow,
  seen: Set<string> = new Set(),
): PatternPromotionResult<TMetrics> {
  if (!isDetectorIdentity(output.detectorIdentity) || entry.identity !== output.detectorIdentity) {
    return reject("NOT_PROMOTED_INTERNAL_ONLY", "catalog", "Unknown or mismatched detector identity.");
  }
  const canonical = getDetectorCatalogEntry(output.detectorIdentity);
  if (canonical.availability !== "available" || output.role !== "primary" ||
    !canonical.eligiblePatternRoles.includes(output.role)) {
    return reject("NOT_PROMOTED_INTERNAL_ONLY", "catalog", "This detector cannot be a primary pattern.");
  }
  const config = entry.eligibility.thresholds;
  if (!config) return reject("INSUFFICIENT_EVIDENCE", "catalog", "Pattern-specific thresholds have not been configured.");
  if (!validPatternEligibilityThresholds(config)) {
    return reject("INSUFFICIENT_EVIDENCE", "catalog", "Invalid eligibility configuration.");
  }
  if (!output.qualification || !output.comparison || !output.eligibility || !output.evidenceRefs ||
    !output.contributingResults || !output.caveats ||
    !canonical.eligibility.requiredValidityFlags.every((flag) => output.qualification.validity[flag] === true) ||
    !validAnalyticalWindow(window) || !containsAnalyticalWindow(window, output.temporalWindow)) {
    return reject("INSUFFICIENT_EVIDENCE", "validity", "Required validity checks or bounded evidence are missing.");
  }
  if (output.executionStatus === "INSUFFICIENT_BASELINE_DATA") {
    return reject("INSUFFICIENT_BASELINE_DATA", "contrast", "The detector lacks comparable history.");
  }
  if (output.executionStatus !== "DETECTED") {
    return reject(output.executionStatus === "NO_PATTERN" ? "NOT_PROMOTED_INTERNAL_ONLY" : "INSUFFICIENT_EVIDENCE",
      "validity", "The detector did not qualify this finding.");
  }
  if (!canonical.eligibility.claimLevels.includes(output.claimLevel) ||
    !canonical.eligibility.repertoireCategories.includes(output.repertoireCategory)) {
    return reject("NOT_PROMOTED_INTERNAL_ONLY", "catalog", "Unsupported claim level or repertoire category.");
  }
  const sample = output.sample;
  if (![sample.qualifyingEpisodes, sample.qualifyingDays].every((n) => Number.isSafeInteger(n) && n > 0) ||
    sample.qualifyingEpisodes < config.minimumComparableOccasions || sample.qualifyingDays < config.minimumDistinctDays) {
    return reject("INSUFFICIENT_EVIDENCE", "recurrence", "Too few comparable occasions or distinct days.");
  }
  const context = output.qualification.context;
  if (!context || context.kind !== canonical.eligibility.requiredContext || !context.key.trim() ||
    !context.description.trim() || !output.comparison.comparabilityNote.trim()) {
    return reject("INSUFFICIENT_EVIDENCE", "context", "Comparable occasions must be named.");
  }
  const contrast = output.qualification.contrast;
  if (!canonical.eligibility.referenceKinds.includes(output.comparison.referenceKind) ||
    !validAnalyticalWindow(output.comparison.window) || !Number.isFinite(contrast.size) ||
    Math.abs(contrast.size) < config.minimumAbsoluteContrast ||
    !["increased", "decreased", "unchanged", "mixed"].includes(contrast.direction) ||
    (contrast.direction === "increased" && contrast.size <= 0) ||
    (contrast.direction === "decreased" && contrast.size >= 0) ||
    (contrast.direction === "unchanged" && contrast.size !== 0) ||
    (output.claimLevel === "sustained-change" && contrast.direction === "unchanged")) {
    return reject("INSUFFICIENT_BASELINE_DATA", "contrast", "A meaningful personal comparison with size and direction is required.");
  }
  if (output.comparison.referenceKind === "own-history") {
    const baseline = output.qualification.baselineSample;
    if (Date.parse(output.comparison.window.end) > Date.parse(output.temporalWindow.start) ||
      output.baseline.comparisonStatus !== "EVALUATED" ||
      !Number.isSafeInteger(baseline.comparableOccasions) || !Number.isSafeInteger(baseline.distinctDays) ||
      baseline.comparableOccasions < config.minimumBaselineOccasions || baseline.distinctDays < config.minimumBaselineDays) {
      return reject("INSUFFICIENT_BASELINE_DATA", "contrast", "A qualified, non-overlapping personal reference is required.");
    }
  }
  const evidence = unionPatternEvidence(output.evidenceRefs);
  const excluded = new Set(output.eligibility.excluded.map((occasion) => occasion.occasionId));
  if (!hasBoundedEvidence(evidence, output.temporalWindow) ||
    evidence.some((ref) => excluded.has(ref.occasionId)) ||
    new Set(evidence.map((ref) => ref.occasionId)).size !== sample.qualifyingEpisodes ||
    new Set(evidence.map((ref) => ref.date)).size !== sample.qualifyingDays ||
    !Number.isFinite(sample.meanCoverageRatio) || sample.meanCoverageRatio > 1 || sample.meanCoverageRatio < config.minimumCoverageRatio ||
    !Number.isFinite(output.qualification.unknownFraction) || output.qualification.unknownFraction < 0 ||
    output.qualification.unknownFraction > config.maximumUnknownFraction ||
    !Number.isFinite(sample.totalObservedHours) || sample.totalObservedHours <= 0) {
    return reject("INSUFFICIENT_EVIDENCE", "evidence", "Evidence lineage, sample counts, coverage or unknown accounting is insufficient.");
  }
  if (!output.contributingResults.some((result) => result.detectorIdentity === output.detectorIdentity &&
    result.role === "primary" && result.resultId === output.resultId) ||
    output.contributingResults.some((result) => {
      if (!isDetectorIdentity(result.detectorIdentity) || !result.resultId.trim() || !result.metricsUsed.length ||
        result.metricsUsed.some((metric) => !metric.trim())) return true;
      const contributor = getDetectorCatalogEntry(result.detectorIdentity);
      return contributor.availability !== "available" ||
        !contributor.eligiblePatternRoles.includes(result.role === "primary" ? "primary" : "contributor") ||
        (result.detectorIdentity !== output.detectorIdentity &&
          !patternRelationship([output.detectorIdentity, result.detectorIdentity]));
    })) {
    return reject("NOT_PROMOTED_INTERNAL_ONLY", "catalog", "Contributor identity, role or relationship is not permitted.");
  }
  if (output.detectorIdentity === "task_execution_fragmentation" &&
    (!output.qualification.gapCategories?.length ||
      output.contributingResults.filter((r) => r.role === "primary").some((r) =>
        r.metricsUsed.some((metric) => detectorCatalog.task_execution_fragmentation.internalMetrics.some((internal) => internal === metric))))) {
    return reject("NOT_PROMOTED_INTERNAL_ONLY", "catalog", "Only gap composition, not a separation ratio, can be promoted.");
  }
  if (output.repertoireCategory === "strength" &&
    (!output.qualification.assessedOutcomeRecordIds?.length ||
      !output.qualification.assessedOutcomeRecordIds.every((id) => evidence.some((ref) => ref.reportIds.includes(id))))) {
    return reject("INSUFFICIENT_EVIDENCE", "evidence", "A strength needs independently assessed outcome evidence.");
  }
  if (!canonical.userQuestions.includes(output.qualification.userQuestion)) {
    return reject("NOT_PROMOTED_INTERNAL_ONLY", "relevance", "The claim does not answer a catalog user question.");
  }
  if (!isNonCausalClaim(output.claim)) {
    return reject("NOT_PROMOTED_INTERNAL_ONLY", "validity", "Causal claims cannot be promoted.");
  }
  const key = patternIncrementalKey(output);
  if (seen.has(key)) return reject("NOT_PROMOTED_INTERNAL_ONLY", "incremental-value", "An unchanged finding was already shown.");
  const copy = generatePatternCopy({ detectorIdentity: output.detectorIdentity, claimLevel: output.claimLevel,
    direction: contrast.direction, gapCategories: output.qualification.gapCategories });
  const pattern: PatternPromotionInput<TMetrics> = {
    ...output,
    ...copy,
    evidenceRefs: evidence,
    contributingResults: [...new Map(output.contributingResults.map((result) => {
      const normalized = { ...result, metricsUsed: [...new Set(result.metricsUsed)].sort() };
      return [JSON.stringify(normalized), normalized] as const;
    })).entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, result]) => result),
    eligibility: {
      required: { ...config },
      observed: { qualifyingEpisodes: sample.qualifyingEpisodes, qualifyingDays: sample.qualifyingDays,
        meanCoverageRatio: sample.meanCoverageRatio, unknownFraction: output.qualification.unknownFraction },
      excluded: [...output.eligibility.excluded].sort((a, b) => a.occasionId < b.occasionId ? -1 : a.occasionId > b.occasionId ? 1 : 0),
    },
    evidenceAnchor: `${sample.qualifyingEpisodes} comparable occasions across ${sample.qualifyingDays} days`,
  };
  seen.add(key);
  return { promoted: true, pattern };
}

export function promotePatterns<TMetrics>(
  outputs: readonly PatternPromotionInput<TMetrics>[],
  entries: readonly DetectorCatalogEntry[],
  window: AnalyticalWindow,
  seen: Set<string> = new Set(),
): PatternPromotionResult<TMetrics>[] {
  return [...outputs].sort((a, b) => {
    for (const [left, right] of [[a.detectorIdentity, b.detectorIdentity],
      [a.temporalWindow.start, b.temporalWindow.start], [a.resultId, b.resultId]] as const) {
      if (left !== right) return left < right ? -1 : 1;
    }
    return 0;
  }).map((output) => {
    const entry = entries.find((candidate) => candidate.identity === output.detectorIdentity);
    return entry ? promotePattern(output, entry, window, seen)
      : reject("NOT_PROMOTED_INTERNAL_ONLY", "catalog", "No catalog entry was supplied.");
  });
}
