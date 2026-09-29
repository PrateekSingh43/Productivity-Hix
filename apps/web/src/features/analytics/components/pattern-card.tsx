"use client";

import { useState } from "react";
import type { BehavioralPatternOutput, RepertoireCategory } from "../types";
import {
  claimLabels,
  dateLabel,
  displayCopy,
  eligibilityLines,
  evidenceAnchor,
  patternHeadline,
  resultGloss,
} from "../lib/presentation";
import { DetailSection, EvidenceLink, EvidenceRows } from "./analytics-evidence";

const repertoireStyles: Record<RepertoireCategory, string> = {
  strength: "border-teal-400/20 bg-teal-400/5 text-teal-700 dark:text-teal-200",
  stable: "border-border-subtle bg-bg-secondary text-text-secondary",
  emerging: "border-sky-400/20 bg-sky-400/5 text-sky-700 dark:text-sky-200",
  changed: "border-violet-400/20 bg-violet-400/5 text-violet-700 dark:text-violet-200",
  friction: "border-stone-400/20 bg-stone-400/5 text-text-secondary",
  mismatch: "border-amber-400/20 bg-amber-400/5 text-amber-700 dark:text-amber-200",
  opportunity: "border-indigo-400/20 bg-indigo-400/5 text-indigo-700 dark:text-indigo-200",
};

const fallbackBadgeStyle = "border-border-subtle bg-bg-secondary text-text-secondary";

export function PatternCard({ pattern }: { pattern: BehavioralPatternOutput }) {
  const [dismissed, setDismissed] = useState(false);
  const anchor = evidenceAnchor(pattern.evidenceAnchor);
  const counts = pattern.eligibility ? eligibilityLines(pattern.eligibility) : [];
  const excluded = pattern.eligibility?.excluded ?? [];
  const caveats = pattern.caveats ?? [];
  const contributingResults = pattern.contributingResults ?? [];
  const evidenceRefs = pattern.evidenceRefs ?? [];
  const comparison = pattern.comparison;
  const claimText = claimLabels[pattern.claimLevel as keyof typeof claimLabels] ?? "A finding across comparable occasions";

  if (dismissed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle p-4 text-sm text-text-secondary">
        Finding hidden for this visit.
        <button
          type="button"
          onClick={() => setDismissed(false)}
          className="min-h-11 px-3 text-text-primary underline"
        >
          Undo
        </button>
      </div>
    );
  }

  return (
    <article className="min-w-0 space-y-3 rounded-xl border border-border-subtle bg-bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="min-w-0 max-w-2xl wrap-break-word text-lg font-medium text-text-primary">
          {patternHeadline(pattern)}
        </h2>
        <span className={`rounded-full border px-2.5 py-1 text-xs capitalize ${repertoireStyles[pattern.repertoireCategory] ?? fallbackBadgeStyle}`}>
          {pattern.repertoireCategory ?? "Finding"}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-text-secondary">
        {displayCopy(pattern.supportingLine, "A finding across comparable records; inspect the details and limits below.")}
      </p>
      {anchor && <p className="text-xs text-text-muted">{anchor}</p>}
      <EvidenceLink evidence={evidenceRefs[0]} />
      <details className="group border-t border-border-subtle pt-2">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-text-primary">
          Details
        </summary>
        <div className="space-y-5 pt-3 text-sm leading-relaxed text-text-secondary">
          <DetailSection title="What this says">
            <p>{claimText}</p>
          </DetailSection>
          <DetailSection title="Comparison">
            <p>
              {comparison?.referenceKind === "declared-intention"
                ? "Compared with your declared plans."
                : comparison?.referenceKind === "own-history"
                ? "Compared with your earlier recorded work."
                : "Comparison reference not provided."}
            </p>
            <p>
              {dateLabel(comparison?.window?.start)} – {dateLabel(comparison?.window?.end)}
            </p>
            <p>
              {displayCopy(comparison?.comparabilityNote, "A plain-language comparison note was not provided.")}
            </p>
          </DetailSection>
          <DetailSection title="Comparable work">
            {counts.length ? counts.map((line) => <p key={line}>{line}</p>) : <p>Comparable occasion counts were not provided.</p>}
            <p>{excluded.length} excluded occasions</p>
            <ul className="list-disc space-y-1 pl-5">
              {excluded.map((item, index) => (
                <li key={`${item?.occasionId ?? "occasion"}-${index}`}>
                  {displayCopy(item?.reason, "This occasion could not be compared; a plain-language reason was not provided.")}
                </li>
              ))}
            </ul>
          </DetailSection>
          <DetailSection title="Limits and exceptions">
            {caveats.length ? (
              <ul className="list-disc space-y-1 pl-5">
                {caveats.map((line, index) => (
                  <li key={index}>
                    {displayCopy(line, "An additional limitation was recorded; its plain-language description is not available.")}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No limits or exceptions were supplied with this finding.</p>
            )}
          </DetailSection>
          <DetailSection title="Supporting observations">
            {contributingResults.length ? (
              <ul className="list-disc space-y-1 pl-5">
                {contributingResults.map((result, index) => (
                  <li key={`${result?.resultId ?? "result"}-${index}`}>{resultGloss(result)}</li>
                ))}
              </ul>
            ) : (
              <p>Supporting descriptions were not provided.</p>
            )}
          </DetailSection>
          <EvidenceRows evidence={evidenceRefs} />
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="min-h-11 text-text-muted underline underline-offset-4"
          >
            Dismiss for this visit
          </button>
        </div>
      </details>
    </article>
  );
}
