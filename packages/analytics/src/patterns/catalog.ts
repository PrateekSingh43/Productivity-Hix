import type { PatternClaimLevel, PatternRepertoireCategory } from "@repo/types";

export interface PatternEligibilityThresholds {
  minimumComparableOccasions: number;
  minimumDistinctDays: number;
  minimumCoverageRatio: number;
  maximumUnknownFraction: number;
  minimumBaselineOccasions: number;
  minimumBaselineDays: number;
  minimumAbsoluteContrast: number;
}

interface CatalogDefinition {
  displayGloss: string;
  availability: "available" | "blocked-not-implemented" | "not-implemented" | "insight-material-only";
  eligiblePatternRoles: readonly ("contributor" | "primary")[];
  userQuestions: readonly string[];
  eligibility: {
    requiredValidityFlags: readonly string[];
    claimLevels: readonly PatternClaimLevel[];
    repertoireCategories: readonly PatternRepertoireCategory[];
    referenceKinds: readonly ("own-history" | "declared-intention")[];
    requiredContext: "task" | "workstream" | "day-type" | "commitment" | "reflection";
    thresholds: PatternEligibilityThresholds | null;
  };
  internalMetrics: readonly string[];
}

export const detectorCatalog = {
  context_switching_density: {
    displayGloss: "Changes between recorded software contexts",
    availability: "available",
    eligiblePatternRoles: ["contributor"],
    userQuestions: ["How often did my recorded environment change during eligible work?"],
    eligibility: {
      requiredValidityFlags: ["afkExcluded", "unknownExcluded", "windowsClipped", "taskLinkagePreserved", "metricQualifiedBaseline"],
      claimLevels: ["co-occurrence"],
      repertoireCategories: ["changed", "stable"],
      referenceKinds: ["own-history"],
      requiredContext: "task",
      thresholds: null,
    },
    internalMetrics: ["switchesPerHour"],
  },
  task_execution_fragmentation: {
    displayGloss: "What separates returns to a linked task",
    availability: "available",
    eligiblePatternRoles: ["primary", "contributor"],
    userQuestions: ["When I return to a task, what separates my sessions — and has the mix changed?"],
    eligibility: {
      requiredValidityFlags: ["windowsClipped", "symmetricSegmentation", "taskLifecycleBounded", "gapMeaningPreserved"],
      claimLevels: ["recurrence", "sustained-change", "co-occurrence"],
      repertoireCategories: ["changed", "mismatch", "stable", "emerging"],
      referenceKinds: ["own-history", "declared-intention"],
      requiredContext: "task",
      thresholds: null,
    },
    internalMetrics: ["wallClockFragmentationRatio", "currentMedianFragmentation", "deltaFragmentation", "F-ratio"],
  },
  extended_continuous_activity: {
    displayGloss: "Longest recorded stretches, with unobserved gaps kept separate",
    availability: "available",
    eligiblePatternRoles: ["primary", "contributor"],
    userQuestions: ["What was my longest recorded stretch of continuous observed work, and how much of it was actually observed?"],
    eligibility: {
      requiredValidityFlags: ["windowsClipped", "coverageDenominatorDisclosed", "observedSpanSeparated", "metricQualifiedBaseline"],
      claimLevels: ["sustained-change"],
      repertoireCategories: ["strength", "changed"],
      referenceKinds: ["own-history"],
      requiredContext: "workstream",
      thresholds: null,
    },
    internalMetrics: [],
  },
  schedule_variance: {
    displayGloss: "When work began compared with the plan in effect",
    availability: "available",
    eligiblePatternRoles: ["primary"],
    userQuestions: ["Did work on planned tasks begin when I planned — and when it didn't, did the plan or the start move?"],
    eligibility: {
      requiredValidityFlags: ["windowsClipped", "planSnapshots", "asOfEvaluation", "onsetCorroborated", "personalTolerance"],
      claimLevels: ["recurrence", "co-occurrence"],
      repertoireCategories: ["mismatch"],
      referenceKinds: ["declared-intention"],
      requiredContext: "task",
      thresholds: null,
    },
    internalMetrics: [],
  },
  start_friction: {
    displayGloss: "Time between deciding to start and recorded work",
    availability: "blocked-not-implemented",
    eligiblePatternRoles: [],
    userQuestions: ["How long between deciding to start and actually starting?"],
    eligibility: {
      requiredValidityFlags: ["commitmentSignal"],
      claimLevels: ["recurrence"],
      repertoireCategories: ["friction"],
      referenceKinds: ["declared-intention"],
      requiredContext: "commitment",
      thresholds: null,
    },
    internalMetrics: [],
  },
  quiet_work_recurrence: {
    displayGloss: "How often days include quiet, recorded work",
    availability: "not-implemented",
    eligiblePatternRoles: ["primary"],
    userQuestions: ["How often do I get quiet, uninterrupted-ish work days, and is that changing?"],
    eligibility: {
      requiredValidityFlags: ["nonqualifyingDaysCounted", "qualifyingDayDefinitionDisclosed"],
      claimLevels: ["recurrence", "sustained-change"],
      repertoireCategories: ["changed", "stable"],
      referenceKinds: ["own-history"],
      requiredContext: "day-type",
      thresholds: null,
    },
    internalMetrics: ["switchesPerHour"],
  },
  stability_shift: {
    displayGloss: "How recorded work lengths vary within one day",
    availability: "insight-material-only",
    eligiblePatternRoles: [],
    userQuestions: ["On my heaviest days, does my later work shrink compared to earlier work?"],
    eligibility: {
      requiredValidityFlags: ["dayQualified"],
      claimLevels: [],
      repertoireCategories: [],
      referenceKinds: ["own-history"],
      requiredContext: "reflection",
      thresholds: null,
    },
    internalMetrics: [],
  },
} as const satisfies Record<string, CatalogDefinition>;

export type DetectorIdentity = keyof typeof detectorCatalog;
export type PatternRoleFor<I extends DetectorIdentity> =
  (typeof detectorCatalog)[I]["eligiblePatternRoles"][number];
export type CatalogPatternIdentity = {
  [I in DetectorIdentity]: { detectorIdentity: I; role: PatternRoleFor<I> };
}[DetectorIdentity];

export interface DetectorCatalogEntry extends CatalogDefinition {
  identity: DetectorIdentity;
}

export function isDetectorIdentity(identity: string): identity is DetectorIdentity {
  return Object.hasOwn(detectorCatalog, identity);
}

export function getDetectorCatalogEntry(identity: DetectorIdentity): DetectorCatalogEntry {
  return { identity, ...detectorCatalog[identity] };
}

export function validPatternEligibilityThresholds(thresholds: PatternEligibilityThresholds): boolean {
  const counts = [thresholds.minimumComparableOccasions, thresholds.minimumDistinctDays,
    thresholds.minimumBaselineOccasions, thresholds.minimumBaselineDays];
  const ratios = [thresholds.minimumCoverageRatio, thresholds.maximumUnknownFraction];
  if (counts.some((n) => !Number.isSafeInteger(n) || n < 1) ||
    ratios.some((n) => !Number.isFinite(n) || n < 0 || n > 1) ||
    !Number.isFinite(thresholds.minimumAbsoluteContrast) || thresholds.minimumAbsoluteContrast < 0 ||
    thresholds.minimumComparableOccasions < 2) {
    return false;
  }
  return true;
}

export function configureDetectorCatalogEntry(
  identity: DetectorIdentity,
  thresholds: PatternEligibilityThresholds,
): DetectorCatalogEntry {
  if (!validPatternEligibilityThresholds(thresholds)) throw new Error("Invalid pattern eligibility thresholds");
  const entry = getDetectorCatalogEntry(identity);
  return { ...entry, eligibility: { ...entry.eligibility, thresholds: { ...thresholds } } };
}

export const patternRelationships = {
  "context_switching_density|task_execution_fragmentation": "co-occurrence",
  "schedule_variance|task_execution_fragmentation": "context",
  "extended_continuous_activity|quiet_work_recurrence": "constitutive",
} as const;

export function patternRelationship(identities: readonly DetectorIdentity[]) {
  if (identities.length !== 2 || identities[0] === identities[1]) return undefined;
  const key = [...identities].sort().join("|");
  return Object.hasOwn(patternRelationships, key)
    ? patternRelationships[key as keyof typeof patternRelationships]
    : undefined;
}
