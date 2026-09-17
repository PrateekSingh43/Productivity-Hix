import { format, subDays } from "date-fns";
import type {
  AnalyticsDiagnostics,
  AnalyticsPeriod,
  BehavioralPatternOutput,
  InsightOutput,
  RepertoireCategory,
} from "./api/analytics";

export const patternHeadlines: Record<RepertoireCategory, string> = {
  strength: "A recorded approach linked to what mattered",
  stable: "A similar picture across comparable work",
  emerging: "An early finding across comparable work",
  changed: "A change across comparable work",
  friction: "A gap between intended and recorded starts",
  mismatch: "A difference between plans and recorded work",
  opportunity: "A supported possibility for your work",
};

export const claimLabels = {
  recurrence: "Seen across comparable occasions",
  "sustained-change": "A change that continued over time",
  "co-occurrence": "Seen together, not shown to cause each other",
  contrast: "A difference between comparable records",
  "pattern-outcome-association": "Seen alongside outcomes you assessed",
};

const internalCopy = /\b(fragmentation|switching|variance|baseline|recurrence|scores?|confidence|elevated|degraded|habits?|fatigue|procrastination|discipline|productivity|validity|detectors?|snapshots?|separation ratio|gap-mix|immutable|primary pattern|internal gate|kept internal|bounded evidence)\b|\b[a-z]+(?:_[a-z0-9]+)+\b|\bD[1-7]\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const unsupportedNumbers = /%|\b\d+(?:\.\d+)?\s*(?:\/|:|per\b)|\b\d+\.\d+\b/;

export function displayCopy(value: unknown, fallback = ""): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  if (internalCopy.test(value) || unsupportedNumbers.test(value)) return fallback;
  return value.trim();
}

export function patternHeadline(pattern: BehavioralPatternOutput): string {
  return displayCopy(pattern.headline, patternHeadlines[pattern.repertoireCategory] ?? "A finding across comparable work");
}

export function analyticsPeriod(days: 14 | 30, now = new Date()): AnalyticsPeriod {
  return { from: format(subDays(now, days - 1), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
}

export function evidenceDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && format(parsed, "yyyy-MM-dd") === value ? value : null;
}

export function timelineHref(date: string): string | null {
  const valid = evidenceDate(date);
  return valid ? `/timeline?date=${valid}` : null;
}

export function dateLabel(value: string): string {
  const date = evidenceDate(value.slice(0, 10));
  return date ? format(new Date(`${date}T12:00:00`), "MMM d, yyyy") : "Date not provided";
}

export function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const countFields = [
  { required: ["minimumComparableOccasions", "comparableOccasions", "occasions"], observed: ["qualifyingEpisodes", "comparableOccasions", "occasions"], label: "comparable occasions" },
  { required: ["minimumDistinctDays", "minimumDistinctCalendarDays", "distinctDays", "days"], observed: ["qualifyingDays", "distinctDays", "days"], label: "comparable workdays" },
  { required: ["minimumBaselineOccasions"], observed: ["baselineOccasions"], label: "earlier comparable occasions" },
  { required: ["minimumBaselineDays"], observed: ["baselineDays"], label: "earlier comparable workdays" },
];

export function eligibilityLines(eligibility: BehavioralPatternOutput["eligibility"]): string[] {
  return countFields.flatMap(({ required, observed, label }) => {
    const needed = required.map((key) => eligibility.required[key]).find(isCount);
    const found = observed.map((key) => eligibility.observed[key]).find(isCount);
    if (found !== undefined && needed !== undefined) return [`${found} of ${needed} ${label}`];
    if (found !== undefined) return [`${found} ${label} observed`];
    if (needed !== undefined) return [`${needed} ${label} required; observed count not provided`];
    return [];
  });
}

export function evidenceAnchor(value: string | undefined): string {
  const text = displayCopy(value);
  return /\b\d+(?: of \d+)? (?:comparable |recorded |observed |eligible )*(?:workdays?|days?|occasions?|sessions?|blocks?|tasks?)\b/i.test(text) ? text : "";
}

const resultGlosses: Record<string, string> = {
  context_switching_density: "Changes between recorded software contexts",
  task_execution_fragmentation: "What separated returns to a linked task",
  extended_continuous_activity: "Lengths of recorded stretches, keeping unobserved gaps separate",
  schedule_variance: "When work began compared with the plan in effect",
  start_friction: "Time between deciding to start and recorded work",
  quiet_work_recurrence: "Days that included quiet, recorded work",
  stability_shift: "How recorded work lengths differed within a day",
};

export function resultGloss(result: BehavioralPatternOutput["contributingResults"][number]): string {
  return displayCopy(result.gloss, resultGlosses[result.detectorIdentity] ?? "Supporting recorded activity; description not provided");
}

export function diagnosticLines(diagnostics?: AnalyticsDiagnostics): string[] {
  return [...new Set((diagnostics?.perDetector ?? []).flatMap(({ status, reason }) => {
    if (!reason && !/insufficient|indeterminate|not.implemented|blocked/i.test(status)) return [];
    const plainReason = displayCopy(reason);
    const text = reason?.trim() || status;
    if (!plainReason || !/^(no[ _-](pattern|insight|findings?)|detected|promoted|ok|success)$/i.test(status)) {
      if (/snapshot|plan.revision/i.test(text)) return ["Saved plans from before work began are missing."];
      if (/baseline|history|historical|gap-mix|separation/i.test(text)) return ["More earlier comparable work is needed for this comparison."];
      if (/reflection|personal.context/i.test(text)) return ["Related reflections or assessed outcomes are missing."];
      if (/not.implemented|blocked/i.test(`${text} ${status}`)) return ["This comparison is not available yet."];
      if (/coverage|unknown|telemetry|corroborat|activity/i.test(text)) return ["Some periods do not have enough recorded activity to compare."];
      if (/contributor|primary|alongside/i.test(text)) return ["Changes between software contexts are evaluated alongside other work."];
      if (/insufficient|occasion|distinct.day|qualif/i.test(text)) return ["More comparable occasions are needed."];
    }
    if (plainReason) return [plainReason];
    if (/insufficient/i.test(status)) return ["More comparable occasions are needed."];
    return ["More comparable occasions are needed."];
  }))];
}

export function insightExplanation(insight: InsightOutput): string {
  const kinds = [...new Set(insight.personalElements.map(({ kind }) => ({
    intention: "declared intentions",
    reflection: "your reflections",
    outcome: "outcomes you assessed",
    retention: "your recall records",
  })[kind]).filter(Boolean))];
  return displayCopy(insight.supportingLine, kinds.length
    ? `Recorded work is considered alongside ${kinds.join(" and ")}.`
    : "Inspect the linked records and the limits of this finding.");
}
