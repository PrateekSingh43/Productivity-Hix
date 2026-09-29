"use client";

import Link from "next/link";
import { RefreshCw, Unplug } from "lucide-react";
import type { AnalyticsResponse, EarlySignal } from "../types";
import { detectorGloss, diagnosticLines, earlySignalNeedsLine, isCount } from "../lib/presentation";

interface AnalyticsStateProps {
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  data?: AnalyticsResponse;
  onRetry: () => void;
  noInsight?: boolean;
  onRunAnalysis?: () => void;
  isRunningAnalysis?: boolean;
  /** POST /analyze failure text (mutation.error). Shown inline; GET errors use isError. */
  runError?: string | null;
  /** True when state has been RUNNING longer than the client timeout. */
  runningTimedOut?: boolean;
}

/** Honest observed-progress line: counts only, never a promise. */
function progressLine(data: AnalyticsResponse): string | null {
  const detectors = data.diagnostics?.perDetector ?? [];
  let best: { occasions: number; days: number; gloss: string } | null = null;
  for (const d of detectors) {
    if (d.availability === "NOT_AVAILABLE") continue;
    const occasions = typeof d.eligibleOccasions === "number" ? d.eligibleOccasions : 0;
    const days = typeof d.eligibleDays === "number" ? d.eligibleDays : 0;
    if (occasions <= 0) continue;
    const gloss = detectorGloss(d.identity);
    if (!gloss) continue;
    if (!best || occasions > best.occasions) best = { occasions, days, gloss };
  }
  if (!best) return null;
  const occasionWord = best.occasions === 1 ? "occasion" : "occasions";
  const dayWord = best.days === 1 ? "day" : "days";
  return `${best.occasions} comparable ${occasionWord} across ${best.days} ${dayWord} so far — most progress in ${best.gloss.charAt(0).toLowerCase()}${best.gloss.slice(1)}.`;
}

function RunError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
      The analysis request failed: {message} Your recorded activity is safe — try again.
    </div>
  );
}

function RunButton({
  onRunAnalysis,
  disabled,
  spinning,
  label,
}: {
  onRunAnalysis: () => void;
  disabled: boolean;
  spinning: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onRunAnalysis}
      disabled={disabled}
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-subtle px-3 text-sm text-text-primary disabled:opacity-50"
    >
      <RefreshCw size={14} className={spinning ? "animate-spin" : ""} aria-hidden="true" />
      {label}
    </button>
  );
}

export function AnalyticsState({
  isLoading,
  isError,
  isFetching,
  data,
  onRetry,
  noInsight,
  onRunAnalysis,
  isRunningAnalysis,
  runError,
  runningTimedOut,
}: AnalyticsStateProps) {
  const isWorking = isFetching || Boolean(isRunningAnalysis);

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading findings" className="space-y-4">
        <span className="sr-only">Loading findings</span>
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            aria-hidden="true"
            className="space-y-4 rounded-xl border border-border-subtle bg-bg-card p-6 motion-safe:animate-pulse"
          >
            <div className="h-5 w-2/3 rounded bg-bg-secondary" />
            <div className="h-3 w-full rounded bg-bg-secondary" />
            <div className="h-3 w-1/3 rounded bg-bg-secondary" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-border-subtle bg-bg-card p-6">
        <h2 className="text-sm font-medium text-text-primary">Findings could not be loaded.</h2>
        <p className="text-sm text-text-secondary">Check your connection and try again.</p>
        <button
          type="button"
          onClick={onRetry}
          disabled={isFetching}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-subtle px-3 text-sm text-text-primary disabled:opacity-50"
        >
          <RefreshCw size={14} aria-hidden="true" />
          {isFetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  if (data.state === "ok" && !noInsight) return null;

  if (data.state === "NO_RUN") {
    const blocked = data.analysisBlocked;
    return (
      <div role="status" className="space-y-3 rounded-xl border border-border-subtle bg-bg-card p-6 sm:p-8">
        {runError && <RunError message={runError} />}
        <h2 className="text-base font-medium text-text-primary">
          {blocked?.reason === "request-failed"
            ? "The last analysis attempt failed."
            : blocked?.reason === "worker-offline"
              ? "Analysis requested — waiting for the background worker."
              : "Pattern analysis hasn't run for this period."}
        </h2>
        <p className="text-sm text-text-secondary">
          {blocked?.reason === "request-failed"
            ? "Your recorded activity is safe. The attempt failed before producing results — retry the analysis."
            : blocked?.reason === "worker-offline"
              ? "Your request hasn't been picked up yet, so there is nothing to show. Your activity keeps recording safely; findings will compute once the worker runs. You can leave and come back."
              : "Your activity is being recorded. Pattern analysis will become meaningful once enough comparable evidence exists. Running it now establishes the current baseline."}
        </p>
        {onRunAnalysis && (
          <RunButton
            onRunAnalysis={onRunAnalysis}
            disabled={isWorking}
            spinning={isWorking}
            label={isWorking ? "Starting…" : blocked?.reason === "request-failed" ? "Retry analysis" : "Run analysis"}
          />
        )}
      </div>
    );
  }

  if (data.state === "RUNNING") {
    return (
      <div role="status" className="space-y-3 rounded-xl border border-border-subtle bg-bg-card p-6 sm:p-8">
        <h2 className="text-base font-medium text-text-primary">
          {runningTimedOut ? "Analysis is taking longer than expected." : "Computing patterns from your activity…"}
        </h2>
        <p className="text-sm text-text-secondary">
          {runningTimedOut
            ? "The worker has not finished after 10 minutes — it may be stuck or offline. Your recorded activity is safe. You can wait, retry the view, or re-run the analysis."
            : "The analysis worker is calculating multi-day recurrence and baseline statistics. This view updates automatically when it finishes."}
        </p>
        {runningTimedOut && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={onRetry}
              disabled={isFetching}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-subtle px-3 text-sm text-text-primary disabled:opacity-50"
            >
              <RefreshCw size={14} aria-hidden="true" />
              {isFetching ? "Retrying…" : "Retry view"}
            </button>
            {onRunAnalysis && (
              <RunButton onRunAnalysis={onRunAnalysis} disabled={isWorking} spinning={isWorking} label={isWorking ? "Analyzing…" : "Re-run analysis"} />
            )}
          </div>
        )}
      </div>
    );
  }

  if (data.state === "FAILED") {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-border-subtle bg-bg-card p-6 sm:p-8">
        {runError && <RunError message={runError} />}
        <h2 className="text-base font-medium text-text-primary">Pattern analysis failed.</h2>
        <p className="text-sm text-text-secondary">Your recorded activity is safe. Re-run the analysis.</p>
        {onRunAnalysis && (
          <RunButton onRunAnalysis={onRunAnalysis} disabled={isWorking} spinning={isWorking} label={isWorking ? "Retrying…" : "Re-run analysis"} />
        )}
      </div>
    );
  }

  const count = data.observationCount ?? data.diagnostics?.observationCount;
  const title =
    data.state === "not-connected"
      ? "Activity collection is not connected."
      : data.state === "no-observations"
      ? "No activity observations for this period"
      : data.state === "insufficient-evidence"
      ? "Not enough comparable evidence yet"
      : data.state === "no-findings"
      ? "Analysis completed — no recurring behavior passed the evidence thresholds."
      : noInsight
      ? "Nothing met the bar this period."
      : "Nothing notable this period.";
  const body =
    data.state === "insufficient-evidence"
      ? "Your activity is being recorded. Patterns require comparable work sessions across multiple days. Keep logging work sessions, linking tasks, and reflecting as usual."
      : data.state === "no-findings"
      ? "No detector passed the configured evidence and recurrence thresholds for this period. That is itself a completed result."
      : null;
  const missing = data.state === "insufficient-evidence" ? diagnosticLines(data.diagnostics) : [];
  const earlySignals: EarlySignal[] =
    data.state === "insufficient-evidence" ? (data.earlySignals ?? []).filter((signal) => signal.confidence === "low") : [];
  const progress = data.state === "insufficient-evidence" ? progressLine(data) : null;

  return (
    <div role="status" className="space-y-3 rounded-xl border border-border-subtle bg-bg-card p-6 sm:p-8">
      {runError && <RunError message={runError} />}
      <h2 className="text-base font-medium text-text-primary">{title}</h2>
      {data.state === "not-connected" && (
        <>
          <p className="text-sm text-text-secondary">
            Your collector may be offline. Missing activity does not tell us what you were doing.
          </p>
          <Link
            href="/devices"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-text-primary underline underline-offset-4"
          >
            <Unplug size={14} aria-hidden="true" />
            Check devices
          </Link>
        </>
      )}
      {data.state === "no-observations" && isCount(count) && (
        <p className="text-sm text-text-secondary">{count} activity observations recorded for this period.</p>
      )}
      {body && <p className="text-sm text-text-secondary">{body}</p>}
      {progress && <p className="text-sm text-text-secondary">{progress}</p>}
      {missing.length > 0 && (
        <ul className="list-disc space-y-2 pl-5 text-sm text-text-secondary">
          {missing.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {earlySignals.length > 0 && (
        <div className="space-y-2 pt-1">
          <h3 className="text-sm font-medium text-text-primary">What we&apos;ve seen so far</h3>
          <ul className="space-y-2">
            {earlySignals.map((signal) => (
              <li
                key={signal.detectorIdentity}
                className="rounded-lg border border-border-subtle p-3 text-sm text-text-secondary"
              >
                <p>{signal.headline}</p>
                <p className="mt-1 text-xs text-text-muted">{earlySignalNeedsLine(signal)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {onRunAnalysis && (data.state === "insufficient-evidence" || data.state === "no-findings") && (
        <div className="pt-2">
          <RunButton onRunAnalysis={onRunAnalysis} disabled={isWorking} spinning={isWorking} label={isWorking ? "Analyzing…" : "Re-run analysis"} />
        </div>
      )}
    </div>
  );
}
