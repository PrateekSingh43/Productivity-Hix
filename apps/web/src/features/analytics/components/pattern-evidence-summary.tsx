"use client";

import { Microscope } from "lucide-react";
import type { AnalyticsDiagnostics, RecordingHistory } from "../types";
import { evidenceTotals } from "../lib/evidence-summary";

interface PatternEvidenceSummaryProps {
  diagnostics?: AnalyticsDiagnostics;
  recordingHistory?: RecordingHistory | null;
  /** True when early observations are shown below — sets the supporting copy. */
  hasEarlyObservations: boolean;
}

/**
 * CURRENT EVIDENCE — the top of the insufficient-evidence page.
 *
 * Compact factual summary derived ONLY from response data: strongest
 * observed occasion/day counts plus recorded days when available. Never
 * invents totals; when nothing comparable exists yet, says recording is
 * underway instead of showing a zeroed dashboard.
 */
export function PatternEvidenceSummary({
  diagnostics,
  recordingHistory,
  hasEarlyObservations,
}: PatternEvidenceSummaryProps) {
  const totals = evidenceTotals(diagnostics);
  const recordedDays =
    typeof recordingHistory?.recordedDays === "number" && recordingHistory.recordedDays >= 0
      ? recordingHistory.recordedDays
      : null;

  return (
    <section aria-label="Current evidence" className="flex items-start gap-3 py-1">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border-subtle bg-bg-secondary text-text-tertiary"
      >
        <Microscope size={15} />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          Current evidence
        </h2>
        {totals ? (
          <>
            <p className="text-xl font-semibold tracking-tight text-text-primary">
              {totals.occasions} comparable {totals.occasions === 1 ? "occasion" : "occasions"}
              <span className="text-text-tertiary"> · </span>
              {totals.days} {totals.days === 1 ? "day" : "days"} observed
            </p>
            <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
              {hasEarlyObservations
                ? "Enough recorded activity to surface early observations below, but not enough comparable history to call them established patterns yet."
                : recordedDays !== null && recordedDays > 0
                  ? `Recording is underway across ${recordedDays} ${recordedDays === 1 ? "day" : "days"} — comparable occasions will appear here as they accumulate.`
                  : "Recording is underway — comparable occasions will appear here as they accumulate."}
            </p>
          </>
        ) : (
          <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
            {recordedDays !== null && recordedDays > 0
              ? `Recording is underway across ${recordedDays} ${recordedDays === 1 ? "day" : "days"}. Nothing comparable enough to describe yet — early observations appear here first.`
              : "Recording is underway — comparable occasions will appear here as they accumulate."}
          </p>
        )}
      </div>
    </section>
  );
}
