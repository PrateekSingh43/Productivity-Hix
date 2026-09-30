"use client";

import { RotateCcw } from "lucide-react";
import { dateLabel } from "../lib/presentation";

interface PatternAnalysisMetaProps {
  computedAt?: string | null;
  periodLabel: string;
  /** Secondary re-check action. Never the dominant action on the page. */
  onRecheck?: () => void;
  rechecking?: boolean;
}

/**
 * Quiet technical footer replacing the Analysis-readiness card.
 * Only displays information present in the response: when the analysis
 * completed and which window it covered. The re-check control is a
 * low-emphasis text button — re-running computation is not the product
 * action; continued recording is.
 */
export function PatternAnalysisMeta({ computedAt, periodLabel, onRecheck, rechecking }: PatternAnalysisMetaProps) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
      <p className="text-xs text-text-tertiary">
        {computedAt ? `Analysis completed ${dateLabel(computedAt)} · ` : ""}
        {periodLabel} window
      </p>
      {onRecheck && (
        <button
          type="button"
          onClick={onRecheck}
          disabled={rechecking}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
        >
          <RotateCcw size={12} className={rechecking ? "animate-spin" : ""} aria-hidden="true" />
          {rechecking ? "Checking…" : "Re-check"}
        </button>
      )}
    </footer>
  );
}
