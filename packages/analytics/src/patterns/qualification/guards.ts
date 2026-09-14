import type { PatternSufficiency, IntentionEvidence } from "@repo/types";

/**
 * Shared guards for Phase 4 Qualification.
 * Resolves optional numeric fields according to the semantics:
 * - null -> disabled / not applicable
 * - undefined -> fallback to configured default
 * - number -> enforce explicitly
 */

export function resolveNumericRequirement(
  configuredValue: number | null | undefined,
  defaultValue: number | null
): number | null {
  if (configuredValue === null) {
    return null;
  }
  if (configuredValue === undefined) {
    return defaultValue;
  }
  return configuredValue;
}

export function isRequirementSatisfied(
  actual: number,
  required: number | null,
  comparator: "GTE" | "LTE" = "GTE"
): boolean {
  if (required === null) {
    return true; // Not applicable / disabled
  }
  if (comparator === "GTE") {
    return actual >= required;
  }
  return actual <= required;
}

/**
 * Enforces the Phase 4 attribution rule for TASK_LINKED patterns.
 * TASK_LINKED requires the intention linkType to be "EXPLICIT" and a valid taskId.
 * INFERRED or UNKNOWN are rejected.
 */
export function isValidTaskAttribution(intention: IntentionEvidence | null | undefined): boolean {
  if (!intention) return false;
  if (intention.linkType !== "EXPLICIT") return false;
  if (!intention.taskId || intention.taskId.trim() === "") return false;
  
  return true;
}

/**
 * GENERAL attribution is always valid as it does not require a declared task.
 */
export function isValidGeneralAttribution(): boolean {
  return true;
}
