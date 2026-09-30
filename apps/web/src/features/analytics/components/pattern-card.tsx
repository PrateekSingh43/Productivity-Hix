"use client";

import { useState } from "react";
import type { BehavioralPatternOutput } from "../types";
import {
  claimLabels,
  dateLabel,
  displayCopy,
  eligibilityLines,
  evidenceAnchor,
  patternHeadline,
  resultGloss,
} from "../lib/presentation";
import {
  evidenceFootprintDates,
  observedCounts,
  patternKindLabel,
  referenceKindLine,
} from "../lib/evidence-summary";
import { DetailSection, EvidenceLink, EvidenceRows } from "./analytics-evidence";
import { EvidenceFootprint } from "./evidence-footprint";

/**
 * Structured analytical card for one qualified Pattern.
 *
 * Hierarchy: small context label → strong headline → one explanatory
 * sentence → compact evidence metadata → presence visualization → evidence
 * action → secondary Details disclosure. One main surface with internal
 * dividers; no nested cards. Stays neutral — no category color coding.
 */
export function PatternCard({ pattern }: { pattern: BehavioralPatternOutput }) {
  const [dismissed, setDismissed] = useState(false);
  const anchor = evidenceAnchor(pattern.evidenceAnchor);
  const counts = pattern.eligibility ? eligibilityLines(pattern.eligibility) : [];
  const observed = observedCounts(pattern.eligibility);
  const excluded = pattern.eligibility?.excluded ?? [];
  const caveats = pattern.caveats ?? [];
  const contributingResults = pattern.contributingResults ?? [];
  const evidenceRefs = pattern.evidenceRefs ?? [];
  const comparison = pattern.comparison;
  const claimText = claimLabels[pattern.claimLevel as keyof typeof claimLabels] ?? "A finding across comparable occasions";
  const footprintDates = evidenceFootprintDates(evidenceRefs);
  const referenceLine = referenceKindLine(comparison?.referenceKind);

  if (dismissed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-border-subtle p-4 text-sm text-text-secondary">
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
    <article className="min-w-0 rounded-[var(--radius-lg)] border border-border-subtle bg-bg-card p-5 sm:p-6">
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        {patternKindLabel(pattern.claimLevel)}
      </p>
      <h2 className="mt-1.5 wrap-break-word text-lg font-medium tracking-tight text-text-primary sm:text-xl">
        {patternHeadline(pattern)}
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-text-secondary">
        {displayCopy(pattern.supportingLine, "Seen across comparable recorded occasions; details and limits below.")}
      </p>

      {(observed || referenceLine) && (
        <p className="mt-2.5 text-xs text-text-muted">
          {observed && (
            <span>
              {observed.occasions} comparable {observed.occasions === 1 ? "occasion" : "occasions"}
              {observed.days > 0 && (
                <span> · {observed.days} {observed.days === 1 ? "day" : "days"}</span>
              )}
            </span>
          )}
          {observed && referenceLine && <span aria-hidden="true"> · </span>}
          {referenceLine && <span>{referenceLine}</span>}
        </p>
      )}
      {anchor && <p className="mt-1.5 text-xs text-text-muted">{anchor}</p>}

      {footprintDates.length > 0 && (
        <div className="mt-3 border-t border-border-subtle/60 pt-3">
          <EvidenceFootprint dates={footprintDates} />
        </div>
      )}

      <div className="mt-3">
        <EvidenceLink evidence={evidenceRefs[0]} />
      </div>

      <details className="group mt-2 border-t border-border-subtle pt-2">
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
