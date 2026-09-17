import type { PatternClaimLevel } from "@repo/types";
import type { DetectorIdentity } from "./catalog";

export const BANNED_CAUSAL_PATTERNS: readonly RegExp[] = [
  /\b(causes?|because of|leads? to|due to|results? in)\b/i,
  /\bbecause\b/i,
];

export function isNonCausalClaim(claim: string): boolean {
  return claim.trim().length > 0 && !BANNED_CAUSAL_PATTERNS.some((pattern) => pattern.test(claim));
}

export type GapCategory = "other_task" | "break" | "explained" | "unknown" | "unattributed";
export type ContrastDirection = "increased" | "decreased" | "unchanged" | "mixed";

const gapGlosses: Record<GapCategory, string> = {
  other_task: "work on other tasks",
  break: "recorded breaks",
  explained: "gaps you explained",
  unknown: "time without observations",
  unattributed: "recorded time not linked to a task",
};

export function generateGapMixCopy(categories: readonly GapCategory[]) {
  const gloss = [...new Set(categories)].sort().map((category) => gapGlosses[category]).join(", ");
  return {
    headline: "What separated recorded returns to your tasks",
    supportingLine: gloss
      ? `Recorded returns to linked tasks were separated by ${gloss}; these categories do not establish the purpose of the gaps.`
      : "The records do not yet describe what separated returns to linked tasks.",
  };
}

export function generatePatternCopy(input: {
  detectorIdentity: DetectorIdentity;
  claimLevel: PatternClaimLevel;
  direction: ContrastDirection;
  gapCategories?: readonly GapCategory[];
}) {
  if (input.detectorIdentity === "task_execution_fragmentation") {
    const copy = generateGapMixCopy(input.gapCategories ?? []);
    return { ...copy, supportingLine: `${copy.supportingLine} The mix was compared across the disclosed occasions.` };
  }
  if (input.detectorIdentity === "extended_continuous_activity") {
    const description = input.direction === "increased" ? "longer" : input.direction === "decreased" ? "shorter" : "different";
    return {
      headline: `Recorded work stretches were ${description} than before`,
      supportingLine: `Across comparable recorded occasions, the longest observed stretches were ${description} than in your earlier records; unobserved gaps are not observed work.`,
    };
  }
  if (input.detectorIdentity === "schedule_variance") {
    const direction = input.direction === "increased" ? "later" : input.direction === "decreased" ? "earlier" : "at different times";
    return {
      headline: "Recorded starts differed from the plans in effect",
      supportingLine: `On comparable planned tasks, corroborated work began ${direction} than planned; a changed plan or start is not a judgment about the work.`,
    };
  }
  return {
    headline: "Comparable work records considered together",
    supportingLine: "These records describe comparable occasions, not attention or the value of the work.",
  };
}
