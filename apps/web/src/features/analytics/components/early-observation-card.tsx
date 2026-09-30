"use client";

import { Eye } from "lucide-react";
import type { EarlySignal } from "../types";
import { earlySignalNeedsLine } from "../lib/presentation";

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Primary content for sub-threshold findings.
 *
 * A low-confidence observation: never labeled a Pattern, never scored,
 * never a percentage, never causal. Wording carries the uncertainty
 * ("Early observation") instead of exposing an internal confidence badge.
 */
export function EarlyObservationCard({ signal }: { signal: EarlySignal }) {
  return (
    <article
      aria-label={`Early observation: ${signal.headline}`}
      className="rounded-[var(--radius-lg)] border border-border-subtle bg-bg-card p-5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border-subtle bg-bg-secondary text-text-tertiary"
        >
          <Eye size={15} />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
            Early observation
          </p>
          <h3 className="text-[17px] font-medium leading-snug tracking-tight text-text-primary">
            {signal.headline}
          </h3>
          <p className="text-xs text-text-secondary">
            Seen across {pluralize(signal.occasions, "occasion", "occasions")} ·{" "}
            {pluralize(signal.days, "day", "days")}
          </p>
          <p className="text-xs text-text-muted">{earlySignalNeedsLine(signal)}</p>
        </div>
      </div>
    </article>
  );
}
