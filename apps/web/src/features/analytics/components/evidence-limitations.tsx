"use client";

import { ChevronDown } from "lucide-react";
import type { AnalyticsDiagnostics } from "../types";
import { limitationLines } from "../lib/evidence-summary";

/**
 * "Why this isn't a pattern yet" — visually secondary progressive
 * disclosure. Grouped plain-language reasons only; detector identities,
 * baselines, gates and implementation vocabulary never reach this surface.
 * The user never needs to open this to understand the page.
 */
export function EvidenceLimitations({ diagnostics }: { diagnostics?: AnalyticsDiagnostics }) {
  const lines = limitationLines(diagnostics);
  if (lines.length === 0) return null;
  return (
    <details className="group rounded-[var(--radius-lg)] border border-border-subtle bg-bg-card px-5 py-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm text-text-secondary transition-colors hover:text-text-primary [&::-webkit-details-marker]:hidden">
        <span>Why this isn&rsquo;t a pattern yet</span>
        <ChevronDown size={14} className="shrink-0 text-text-tertiary transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="list-disc space-y-1.5 pb-4 pl-5 text-sm leading-relaxed text-text-secondary">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </details>
  );
}
