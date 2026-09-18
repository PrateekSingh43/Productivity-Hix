"use client";

import { useState } from "react";
import Link from "next/link";
import type { AnalyticsPeriod, InsightOutput } from "../types";
import {
  claimLabels,
  dateLabel,
  displayCopy,
  insightExplanation,
} from "../lib/presentation";
import { DetailSection, EvidenceLink, EvidenceRows } from "./analytics-evidence";

function RelatedPatterns({ insight }: { insight: InsightOutput }) {
  const refs = [...new Set(insight.inputs.flatMap((input) => (input.patternId ? [input.patternId] : [])))];
  return refs.length ? (
    <div className="flex flex-wrap gap-2">
      {refs.map((id) => (
        <Link
          key={id}
          href="/patterns"
          className="inline-flex min-h-11 items-center rounded-full border border-border-subtle bg-bg-secondary px-3 text-xs text-text-secondary hover:text-text-primary"
        >
          Related pattern
        </Link>
      ))}
    </div>
  ) : (
    <p className="text-xs text-text-muted">No related pattern links were supplied.</p>
  );
}

export function InsightCard({ insight, period }: { insight: InsightOutput; period: AnalyticsPeriod }) {
  const [hypothesisDismissed, setHypothesisDismissed] = useState(false);
  const limits = [...insight.doesNotEstablish, ...insight.alternatives];
  const hypothesis = insight.hypothesis;
  const hasPatterns = insight.inputs.some((input) => input.patternId);

  return (
    <article className="min-w-0 space-y-3 rounded-xl border border-border-subtle bg-bg-card p-5 sm:p-6">
      <h2 className="break-words text-lg font-medium leading-relaxed text-text-primary">
        {displayCopy(insight.claim, "A relationship in your recorded work")}
      </h2>
      <p className="text-sm leading-relaxed text-text-secondary">{insightExplanation(insight)}</p>
      <p className="text-xs leading-relaxed text-text-muted">
        What this does not show: {displayCopy(insight.doesNotEstablish[0], "whether one observation caused another.")}
      </p>
      {hasPatterns && <RelatedPatterns insight={insight} />}
      <EvidenceLink evidence={insight.evidenceRefs[0]} />
      <details className="border-t border-border-subtle pt-2">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-text-primary">
          Details
        </summary>
        <div className="space-y-5 pt-3 text-sm leading-relaxed text-text-secondary">
          <DetailSection title="Observation">
            <p>{displayCopy(insight.claim, "A plain-language observation was not provided.")}</p>
            <p>{claimLabels[insight.claimLevel]}</p>
          </DetailSection>
          <DetailSection title="Related patterns">
            <RelatedPatterns insight={insight} />
          </DetailSection>
          <DetailSection title="Time period">
            <p>
              {dateLabel(insight.window?.start ?? period.from)} – {dateLabel(insight.window?.end ?? period.to)}
            </p>
          </DetailSection>
          <EvidenceRows
            evidence={insight.evidenceRefs}
            relatedPatterns={
              hasPatterns ? (
                <div>
                  <p className="text-xs text-text-muted">Pattern inputs to this insight; per-occasion links were not supplied.</p>
                  <RelatedPatterns insight={insight} />
                </div>
              ) : undefined
            }
          />
          <DetailSection title="Limits">
            {limits.length ? (
              <ul className="list-disc space-y-1 pl-5">
                {limits.map((line, index) => (
                  <li key={index}>
                    {displayCopy(line, "An additional limitation was recorded; its plain-language description is not available.")}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No further limits were supplied. These records do not establish cause and effect.</p>
            )}
          </DetailSection>
          {hypothesis && !hypothesisDismissed && (
            <section aria-label="Consider trying" className="space-y-2 border-t border-border-subtle pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-text-primary">
                  Consider trying <span className="font-normal text-text-muted">· Optional</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setHypothesisDismissed(true)}
                  className="min-h-11 text-xs underline underline-offset-4"
                >
                  Dismiss suggestion
                </button>
              </div>
              <p>{displayCopy(hypothesis.adjustment, "A suggestion was supplied without a plain-language description.")}</p>
              {hypothesis.intendedBenefit && (
                <p>Intended benefit: {displayCopy(hypothesis.intendedBenefit, "Not described in plain language.")}</p>
              )}
              {hypothesis.potentialCost && (
                <p>Possible trade-off: {displayCopy(hypothesis.potentialCost, "Not described in plain language.")}</p>
              )}
              {hypothesis.reviewAfter && (
                <p>Review: {displayCopy(hypothesis.reviewAfter, "Review timing not provided in plain language.")}</p>
              )}
            </section>
          )}
          {hypothesis && hypothesisDismissed && (
            <button
              type="button"
              onClick={() => setHypothesisDismissed(false)}
              className="min-h-11 text-xs underline underline-offset-4"
            >
              Show optional suggestion
            </button>
          )}
        </div>
      </details>
    </article>
  );
}
