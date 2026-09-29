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
  const refs = [...new Set((insight.inputs ?? []).flatMap((input) => (input?.patternId ? [input.patternId] : [])))];
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

const REFLECTION_QUOTE_LIMIT = 140;

/**
 * Extracts the linked reflection's date and reported description from the
 * insight's own alternatives lines (`Reflection <id> on <date> reported
 * <description>.`). Render-only: no new queries, nothing invented — null
 * when the line is absent.
 */
function parseReflectionLine(
  recordId: string,
  alternatives: string[],
): { date: string; description: string } | null {
  const prefix = `Reflection ${recordId} on `;
  const line = alternatives.find((alternative) => alternative.startsWith(prefix));
  if (!line) return null;
  const rest = line.slice(prefix.length);
  const separator = " reported ";
  const index = rest.indexOf(separator);
  if (index < 0) return null;
  const description = rest.slice(index + separator.length).replace(/\.\s*$/, "");
  if (!description.trim()) return null;
  return { date: rest.slice(0, index), description };
}

function truncateQuote(value: string, limit = REFLECTION_QUOTE_LIMIT): string {
  const trimmed = value.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1).trimEnd()}…` : trimmed;
}

/**
 * Render-only personal context: aligned reflection quotes (truncated, with
 * timestamp) and assessed-goal badges, derived solely from the insight
 * object. No new query keys. Absent details render an honest fallback.
 */
function PersonalElements({ insight }: { insight: InsightOutput }) {
  const elements = insight.personalElements ?? [];
  const alternatives = insight.alternatives ?? [];
  const evidenceRefs = insight.evidenceRefs ?? [];
  if (!elements.length) return null;
  return (
    <section aria-label="What you reported" className="space-y-2 border-t border-border-subtle pt-3">
      <h3 className="text-sm font-medium text-text-primary">What you reported</h3>
      <ul className="space-y-2">
        {elements.map((element) => {
          const key = `${element?.kind ?? "unknown"}:${element?.recordId ?? "missing"}`;
          if (element?.kind === "reflection") {
            const parsed = parseReflectionLine(element.recordId, alternatives);
            return (
              <li key={key} className="space-y-1">
                <span className="inline-flex items-center rounded-full border border-border-subtle bg-bg-secondary px-3 py-1 text-xs text-text-secondary">
                  Your reflection
                </span>
                {parsed ? (
                  <p className="text-sm leading-relaxed text-text-secondary">
                    <q>{displayCopy(truncateQuote(parsed.description), "A reported experience was recorded.")}</q>
                    <span className="text-xs text-text-muted"> · {dateLabel(parsed.date)}</span>
                  </p>
                ) : (
                  <p className="text-xs text-text-muted">A reported experience was recorded; its description is not available.</p>
                )}
              </li>
            );
          }
          if (element?.kind === "outcome") {
            const occasion = evidenceRefs.find((ref) => ref?.reportIds?.includes(element.recordId));
            return (
              <li key={key} className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-border-subtle bg-bg-secondary px-3 py-1 text-xs text-text-secondary">
                  Assessed goal
                </span>
                <span className="text-xs text-text-muted">
                  {occasion ? dateLabel(occasion.date) : "Linked occasion details were not supplied."}
                </span>
              </li>
            );
          }
          return (
            <li key={key} className="text-xs text-text-muted">
              {element.kind === "intention" ? "A stated intention" : "A retention check"} was linked to this insight.
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function InsightCard({ insight, period }: { insight: InsightOutput; period: AnalyticsPeriod }) {
  const [hypothesisDismissed, setHypothesisDismissed] = useState(false);
  const doesNotEstablish = insight.doesNotEstablish ?? [];
  const alternatives = insight.alternatives ?? [];
  const evidenceRefs = insight.evidenceRefs ?? [];
  const limits = [...doesNotEstablish, ...alternatives];
  const hypothesis = insight.hypothesis;
  const hasPatterns = (insight.inputs ?? []).some((input) => input?.patternId);
  const claimText = claimLabels[insight.claimLevel as keyof typeof claimLabels] ?? "Seen together, not shown to cause each other";

  return (
    <article className="min-w-0 space-y-3 rounded-xl border border-border-subtle bg-bg-card p-5 sm:p-6">
      <h2 className="break-words text-lg font-medium leading-relaxed text-text-primary">
        {displayCopy(insight.claim, "A relationship in your recorded work")}
      </h2>
      <p className="text-sm leading-relaxed text-text-secondary">{insightExplanation(insight)}</p>
      <p className="text-xs leading-relaxed text-text-muted">
        What this does not show: {displayCopy(doesNotEstablish[0], "whether one observation caused another.")}
      </p>
      {hasPatterns && <RelatedPatterns insight={insight} />}
      <PersonalElements insight={insight} />
      <EvidenceLink evidence={evidenceRefs[0]} />
      <details className="border-t border-border-subtle pt-2">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium text-text-primary">
          Details
        </summary>
        <div className="space-y-5 pt-3 text-sm leading-relaxed text-text-secondary">
          <DetailSection title="Observation">
            <p>{displayCopy(insight.claim, "A plain-language observation was not provided.")}</p>
            <p>{claimText}</p>
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
            evidence={evidenceRefs}
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
