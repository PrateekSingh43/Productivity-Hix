import type {
  AnalyticsDiagnostics,
  AnalyticsEvidenceRef,
  BehavioralPatternOutput,
} from "../types";
import { diagnosticLines } from "./presentation";

export interface EvidenceTotals {
  occasions: number;
  days: number;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Strongest observed evidence across available detectors.
 *
 * Purpose: a single honest "what we know" summary for the CURRENT EVIDENCE
 * section. Takes the maximum occasions/days over detectors that actually
 * reported counts — never sums across detectors (that would double-count
 * the same work) and never invents totals when nothing was observed.
 */
export function evidenceTotals(diagnostics?: AnalyticsDiagnostics): EvidenceTotals | null {
  let occasions = 0;
  let days = 0;
  let seen = false;
  for (const detector of diagnostics?.perDetector ?? []) {
    if (detector.availability === "NOT_AVAILABLE") continue;
    if (!isNonNegativeInt(detector.eligibleOccasions) || !isNonNegativeInt(detector.eligibleDays)) continue;
    if (detector.eligibleOccasions <= 0) continue;
    seen = true;
    occasions = Math.max(occasions, detector.eligibleOccasions);
    days = Math.max(days, detector.eligibleDays);
  }
  return seen ? { occasions, days } : null;
}

/**
 * Observed-only counts from a pattern's eligibility record.
 *
 * Purpose: metadata chips like "4 comparable occasions · 4 days". Reads ONLY
 * the observed side — required-side thresholds are internal gates and are
 * never surfaced here.
 */
export function observedCounts(
  eligibility: BehavioralPatternOutput["eligibility"] | undefined | null
): EvidenceTotals | null {
  if (!eligibility || typeof eligibility.observed !== "object" || eligibility.observed === null) {
    return null;
  }
  const observed = eligibility.observed as Record<string, unknown>;
  const occasions = ["qualifyingEpisodes", "comparableOccasions", "occasions"]
    .map((key) => observed[key])
    .find(isNonNegativeInt);
  const days = ["qualifyingDays", "distinctDays", "days"]
    .map((key) => observed[key])
    .find(isNonNegativeInt);
  if (occasions === undefined || occasions <= 0) return null;
  return { occasions, days: days ?? 0 };
}

/**
 * Unique sorted evidence dates (YYYY-MM-DD) for the evidence footprint.
 *
 * Purpose: presence visualization only — which days contributed occasions.
 * Returns [] when no valid dates exist; callers render nothing rather than
 * fabricating points.
 */
export function evidenceFootprintDates(
  refs: readonly AnalyticsEvidenceRef[] | undefined | null
): string[] {
  const dates = new Set<string>();
  for (const ref of refs ?? []) {
    const raw = typeof ref?.date === "string" ? ref.date.slice(0, 10) : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) dates.add(raw);
  }
  return [...dates].sort();
}

/**
 * Grouped plain-language limitation lines for the "why this isn't a
 * pattern yet" disclosure. Reuses the existing diagnostic mapping
 * (already deduplicated) and caps the list so the section stays secondary.
 */
export function limitationLines(diagnostics?: AnalyticsDiagnostics, limit = 5): string[] {
  return diagnosticLines(diagnostics).slice(0, Math.max(1, limit));
}

/**
 * Plain-language comparison reference. Maps the backend referenceKind to
 * user vocabulary; unknown values fall back to a neutral line — never an
 * internal term.
 */
export function referenceKindLine(referenceKind: unknown): string | null {
  if (referenceKind === "declared-intention") return "Compared with your declared plans";
  if (referenceKind === "own-history") return "Compared with your earlier recorded work";
  return null;
}

/**
 * Small neutral category label for a pattern card, derived from claimLevel.
 * Avoids repertoire/claim jargon in the primary layer.
 */
export function patternKindLabel(claimLevel: unknown): string {
  if (claimLevel === "sustained-change") return "Sustained change";
  if (claimLevel === "co-occurrence") return "Seen together";
  return "Recurring behavior";
}
