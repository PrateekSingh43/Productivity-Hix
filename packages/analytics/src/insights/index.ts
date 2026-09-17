import type {
  AnalyticalWindow, EnergyLevel, GoalOutcome, InsightOutput, PatternEvidenceRef, PatternReliability,
} from "@repo/types";
import { configureDetectorCatalogEntry, getDetectorCatalogEntry, isDetectorIdentity, patternRelationship, type PatternEligibilityThresholds } from "../patterns/catalog";
import { isNonCausalClaim } from "../patterns/copy";
import { containsAnalyticalWindow, hasBoundedEvidence, unionPatternEvidence, validAnalyticalWindow } from "../patterns/lineage";
import { promotePattern, type PatternPromotionInput } from "../patterns/promotion";

export { BANNED_CAUSAL_PATTERNS, isNonCausalClaim } from "../patterns/copy";

export interface PatternInput {
  pattern: PatternPromotionInput<unknown>;
}

export interface ReflectionInput {
  recordId: string;
  date: string;
  reportedEnergy?: EnergyLevel;
  reportedProgress?: boolean;
  blockers?: string[];
}

export interface OutcomeInput {
  recordId: string;
  taskId?: string;
  goalOutcome: GoalOutcome;
  date?: string;
}

export interface ObservationInput {
  kind: string;
  date: string;
  summary: string;
  metrics?: Record<string, number | null>;
  observationRef: string;
  window: AnalyticalWindow;
  evidenceRefs: PatternEvidenceRef[];
  reliability: PatternReliability;
  validity: { qualified: boolean; coverageSufficient: boolean };
}

export interface InsightCompositionInput {
  patterns?: readonly PatternInput[];
  observation?: ObservationInput;
  reflections?: readonly ReflectionInput[];
  outcomes?: readonly OutcomeInput[];
  window: AnalyticalWindow;
}

function emptyInsight(window: AnalyticalWindow, status: "NO_INSIGHT" | "INSUFFICIENT_EVIDENCE" = "NO_INSIGHT"): InsightOutput {
  return {
    inputs: [], personalElements: [], claim: "No insight this period.", claimLevel: "co-occurrence",
    alternatives: [], doesNotEstablish: [], evidenceRefs: [], status, window: { ...window }, reliability: null,
  };
}

function canonicalRecords<T extends { recordId: string }>(records: readonly T[]): T[] | null {
  const unique = new Map<string, T>();
  for (const record of records) {
    if (!record.recordId.trim()) return null;
    const previous = unique.get(record.recordId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(record)) return null;
    unique.set(record.recordId, record);
  }
  return [...unique.values()].sort((a, b) => a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0);
}

function reflectionDescription(reflection: ReflectionInput): string {
  const parts: string[] = [];
  if (reflection.reportedEnergy) parts.push(`${reflection.reportedEnergy} energy`);
  if (reflection.reportedProgress !== undefined) parts.push(reflection.reportedProgress ? "progress" : "no progress");
  if (reflection.blockers?.length) parts.push("blockers");
  return parts.join(" and ");
}

function conservativeReliability(values: PatternReliability[], hasReport: boolean): PatternReliability {
  return {
    tier: "PROVISIONAL",
    calibrationStatus: "UNVALIDATED_PROTOTYPE",
    evidenceQualityFactors: {
      qualifyingDayCount: Math.min(...values.map((v) => v.evidenceQualityFactors.qualifyingDayCount)),
      qualifyingEpisodeCount: Math.min(...values.map((v) => v.evidenceQualityFactors.qualifyingEpisodeCount)),
      meanTelemetryCoverageRatio: Math.min(...values.map((v) => v.evidenceQualityFactors.meanTelemetryCoverageRatio)),
      temporalVariability: null,
      baselineMaturityDays: Math.min(...values.map((v) => v.evidenceQualityFactors.baselineMaturityDays)),
      hasCorroboratingSelfReport: hasReport,
    },
  };
}

export function composeInsight(input: InsightCompositionInput): InsightOutput {
  const { window } = input;
  if (!validAnalyticalWindow(window)) return emptyInsight(window, "INSUFFICIENT_EVIDENCE");
  const patterns = [...(input.patterns ?? [])].map((value) => value.pattern)
    .sort((a, b) => a.metadata.patternId < b.metadata.patternId ? -1 : a.metadata.patternId > b.metadata.patternId ? 1 : 0);
  const uniquePatterns = new Map<string, PatternPromotionInput<unknown>>();
  for (const pattern of patterns) {
    const previous = uniquePatterns.get(pattern.metadata.patternId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(pattern)) return emptyInsight(window, "INSUFFICIENT_EVIDENCE");
    uniquePatterns.set(pattern.metadata.patternId, pattern);
  }
  const selected = [...uniquePatterns.values()];
  const observation = input.observation;
  if ((!selected.length && !observation) || (selected.length && observation) || selected.length > 2) return emptyInsight(window);
  const first = selected[0];
  if (selected.some((pattern) => pattern.executionStatus !== "DETECTED" ||
    !containsAnalyticalWindow(window, pattern.temporalWindow) || !hasBoundedEvidence(pattern.evidenceRefs, pattern.temporalWindow) ||
    !isNonCausalClaim(pattern.claim) || !isDetectorIdentity(pattern.detectorIdentity) ||
    getDetectorCatalogEntry(pattern.detectorIdentity).availability !== "available" ||
    !getDetectorCatalogEntry(pattern.detectorIdentity).eligiblePatternRoles.includes(pattern.role) ||
    !getDetectorCatalogEntry(pattern.detectorIdentity).eligibility.requiredValidityFlags.every((flag) => pattern.qualification.validity[flag] === true) ||
    pattern.userId !== first?.userId || pattern.temporalWindow.start !== first?.temporalWindow.start ||
    pattern.temporalWindow.end !== first?.temporalWindow.end)) return emptyInsight(window, "INSUFFICIENT_EVIDENCE");
  for (const pattern of selected.filter((candidate) => candidate.role === "primary")) {
    const required = pattern.eligibility.required;
    const thresholds: PatternEligibilityThresholds = {
      minimumComparableOccasions: Number(required.minimumComparableOccasions),
      minimumDistinctDays: Number(required.minimumDistinctDays),
      minimumCoverageRatio: Number(required.minimumCoverageRatio),
      maximumUnknownFraction: Number(required.maximumUnknownFraction),
      minimumBaselineOccasions: Number(required.minimumBaselineOccasions),
      minimumBaselineDays: Number(required.minimumBaselineDays),
      minimumAbsoluteContrast: Number(required.minimumAbsoluteContrast),
    };
    try {
      if (!promotePattern(pattern, configureDetectorCatalogEntry(pattern.detectorIdentity, thresholds), window).promoted) {
        return emptyInsight(window, "INSUFFICIENT_EVIDENCE");
      }
    } catch {
      return emptyInsight(window, "INSUFFICIENT_EVIDENCE");
    }
  }
  const relationship = patternRelationship(selected.map((pattern) => pattern.detectorIdentity));
  if ((selected.length === 2 && !relationship) ||
    (selected.length === 1 && first?.role !== "primary")) return emptyInsight(window);
  if (selected.length === 2 && (!selected.some((pattern) => pattern.role === "primary") ||
    selected.some((pattern) => pattern.qualification.context.key !== first?.qualification.context.key) ||
    !selected[0]!.evidenceRefs.some((left) => selected[1]!.evidenceRefs.some((right) =>
      left.occasionId === right.occasionId && left.date === right.date &&
      Date.parse(left.window.start) < Date.parse(right.window.end) && Date.parse(right.window.start) < Date.parse(left.window.end))))) {
    return emptyInsight(window, "INSUFFICIENT_EVIDENCE");
  }
  if (observation && (!observation.observationRef.trim() || !observation.summary.trim() ||
    !observation.validity.qualified || !observation.validity.coverageSufficient ||
    !containsAnalyticalWindow(window, observation.window) || !hasBoundedEvidence(observation.evidenceRefs, observation.window) ||
    observation.evidenceRefs.some((ref) => ref.date !== observation.date) ||
    Object.values(observation.metrics ?? {}).some((metric) => metric !== null && !Number.isFinite(metric)))) {
    return emptyInsight(window, "INSUFFICIENT_EVIDENCE");
  }
  const evidence = unionPatternEvidence(observation?.evidenceRefs ?? selected.flatMap((pattern) => pattern.evidenceRefs));
  const dates = new Set(evidence.map((ref) => ref.date));
  const reflections = canonicalRecords((input.reflections ?? []).map((reflection) => ({
    ...reflection, blockers: reflection.blockers ? [...new Set(reflection.blockers)].sort() : undefined,
  })));
  const outcomes = canonicalRecords(input.outcomes ?? []);
  if (!reflections || !outcomes || reflections.some((reflection) =>
    (reflection.reportedEnergy !== undefined && !["low", "medium", "high"].includes(reflection.reportedEnergy)) ||
    (reflection.reportedProgress !== undefined && typeof reflection.reportedProgress !== "boolean"))) {
    return emptyInsight(window, "INSUFFICIENT_EVIDENCE");
  }
  const alignedReflections = reflections.filter((reflection) => dates.has(reflection.date) &&
    (!observation || reflection.date === observation.date) && reflectionDescription(reflection));
  const alignedOutcomes = outcomes.filter((outcome) => outcome.goalOutcome !== "NOT_ASSESSED" &&
    ["ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED"].includes(outcome.goalOutcome) &&
    evidence.some((ref) => ref.reportIds.includes(outcome.recordId) &&
      (!outcome.date || outcome.date === ref.date) && (!outcome.taskId || ref.taskIds.includes(outcome.taskId))));
  const useOutcomes = !observation && selected.length === 1 && first?.detectorIdentity === "schedule_variance" && alignedOutcomes.length > 0;
  if (!alignedReflections.length && !useOutcomes) return emptyInsight(window);
  const personalElements: InsightOutput["personalElements"] = alignedReflections.map((reflection) => ({
    kind: "reflection", recordId: reflection.recordId,
  }));
  if (useOutcomes) personalElements.push(...alignedOutcomes.map((outcome) => ({ kind: "outcome" as const, recordId: outcome.recordId })));
  const alternatives = [
    "The recorded occasions may differ in task demands or circumstances not captured here.",
    "Unobserved work and unreported experiences may differ from these records.",
    ...alignedReflections.map((reflection) => `Reflection ${reflection.recordId} on ${reflection.date} reported ${reflectionDescription(reflection)}.`),
  ];
  if (new Set(alignedReflections.map(reflectionDescription)).size > 1) {
    alternatives.push("Reflections differ across these occasions; the reported experiences do not support one uniform account.");
  }
  let claim: string;
  let headline: string;
  if (useOutcomes) {
    const achieved = alignedOutcomes.filter((outcome) => outcome.goalOutcome === "ACHIEVED").length;
    const partial = alignedOutcomes.filter((outcome) => outcome.goalOutcome === "PARTIALLY_ACHIEVED").length;
    const notAchieved = alignedOutcomes.filter((outcome) => outcome.goalOutcome === "NOT_ACHIEVED").length;
    claim = `Recorded differences between planned and actual starts appeared alongside ${achieved} achieved, ${partial} partly achieved and ${notAchieved} not achieved goal assessments on linked occasions.`;
    headline = "Recorded starts and assessed goals considered together";
  } else if (observation) {
    claim = "A qualified observation and reported experience were recorded on the same day; this is a bounded comparison, not a recurring pattern.";
    headline = "A recorded day and your reported experience";
  } else if (relationship) {
    const descriptions = {
      "co-occurrence": "Recorded environment changes and the gaps between task returns were recorded on aligned occasions",
      context: "Recorded gaps between task returns provide context for differences between planned and actual starts",
      constitutive: "Recorded work stretches form part of the disclosed quiet-work day definition",
    };
    claim = `${descriptions[relationship]}; reflections on those occasions reported ${[...new Set(alignedReflections.map(reflectionDescription))].sort().join("; ")}.`;
    headline = "Related work records and your reported experience";
  } else {
    claim = `The recurring work records and your reflections describe different kinds of evidence; on linked occasions you reported ${[...new Set(alignedReflections.map(reflectionDescription))].sort().join("; ")}.`;
    headline = "Recorded work alongside your reported experience";
  }
  if (!isNonCausalClaim(claim)) return emptyInsight(window);
  const refs = unionPatternEvidence(evidence.map((ref) => ({
    ...ref,
    reportIds: [...ref.reportIds, ...alignedReflections.filter((reflection) => reflection.date === ref.date).map((reflection) => reflection.recordId)],
  })));
  const reliabilities = observation ? [observation.reliability] : selected.map((pattern) => pattern.reliability);
  return {
    inputs: observation ? [{ observationRef: observation.observationRef, role: "primary" }]
      : selected.map((pattern) => ({ patternId: pattern.metadata.patternId, role: pattern.role === "primary" ? "primary" : "supporting" })),
    personalElements,
    claim,
    claimLevel: useOutcomes ? "pattern-outcome-association" : observation || relationship ? "co-occurrence" : "contrast",
    alternatives,
    doesNotEstablish: ["These records do not establish causation, attention, effort, or the value of the work.",
      "Task completion does not establish achievement of a daily goal.",
      "This comparison is exploratory and does not establish an effect on future outcomes."],
    evidenceRefs: refs,
    status: "DETECTED",
    window: { ...window },
    reliability: conservativeReliability(reliabilities, alignedReflections.length > 0),
    headline,
    supportingLine: claim,
  };
}

export function composeInsights(inputs: readonly InsightCompositionInput[]): InsightOutput[] {
  const outputs = inputs.map(composeInsight);
  const key = (output: InsightOutput) => JSON.stringify([
    output.inputs.flatMap((ref) => "patternId" in ref ? [ref.patternId] : []).sort().join("|"),
    output.window.start,
    output.inputs.flatMap((ref) => "observationRef" in ref ? [ref.observationRef] : []).sort(),
    output.personalElements,
  ]);
  return [...new Map(outputs.map((output) => [JSON.stringify(output), output])).values()]
    .sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
}
