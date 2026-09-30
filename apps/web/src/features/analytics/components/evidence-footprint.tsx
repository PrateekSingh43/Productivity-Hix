"use client";

import { dateLabel } from "../lib/presentation";

/**
 * Evidence-presence visualization for a qualified Pattern.
 *
 * Dots mark the days that contributed occasions, with first/last day
 * labels. This is NOT a quantitative chart — dot size and spacing carry no
 * magnitude, and missing dates render nothing rather than fabricated points.
 */
export function EvidenceFootprint({ dates }: { dates: string[] }) {
  if (dates.length === 0) return null;
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const label = `Evidence observed on ${dates.length === 1 ? "1 day" : `${dates.length} days`}, ${dateLabel(first)} to ${dateLabel(last)}`;
  return (
    <div className="flex items-center gap-3" role="img" aria-label={label}>
      <div className="flex flex-1 items-center gap-1.5" aria-hidden="true">
        {dates.map((date) => (
          <span key={date} title={dateLabel(date)} className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-tertiary" />
        ))}
        <span className="h-px flex-1 bg-border-subtle" />
      </div>
      <p className="shrink-0 font-mono text-[11px] text-text-muted">
        {dateLabel(first)}
        {dates.length > 1 && <span> – {dateLabel(last)}</span>}
      </p>
    </div>
  );
}
