"use client";

import Link from "next/link";
import { RefreshCw, Unplug } from "lucide-react";
import type { AnalyticsResponse } from "../types";
import { diagnosticLines, isCount } from "../lib/presentation";

interface AnalyticsStateProps {
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  data?: AnalyticsResponse;
  onRetry: () => void;
  noInsight?: boolean;
  onRunAnalysis?: () => void;
  isRunningAnalysis?: boolean;
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
}: AnalyticsStateProps) {
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

  if (data.state === "pending") {
    const isWorking = isFetching || isRunningAnalysis;
    return (
      <div role="status" className="space-y-3 rounded-xl border border-border-subtle bg-bg-card p-6 sm:p-8">
        <h2 className="text-base font-medium text-text-primary">
          {isWorking ? "Computing patterns from your activity…" : "Pattern analysis hasn't run for this period."}
        </h2>
        <p className="text-sm text-text-secondary">
          {isWorking
            ? "Your request was accepted and the analysis worker is calculating multi-day recurrence and baseline statistics."
            : "Run analysis to compute findings from your recorded activity. This usually takes a few seconds."}
        </p>
        {onRunAnalysis && (
          <button
            type="button"
            onClick={onRunAnalysis}
            disabled={isWorking}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-subtle px-3 text-sm text-text-primary disabled:opacity-50"
          >
            <RefreshCw size={14} className={isWorking ? "animate-spin" : ""} aria-hidden="true" />
            {isWorking ? "Analyzing…" : "Run analysis"}
          </button>
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
      : noInsight
      ? "Nothing met the bar this period."
      : "Nothing notable this period.";
  const missing = data.state === "insufficient-evidence" ? diagnosticLines(data.diagnostics) : [];

  return (
    <div role="status" className="space-y-3 rounded-xl border border-border-subtle bg-bg-card p-6 sm:p-8">
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
      {missing.length > 0 && (
        <ul className="list-disc space-y-2 pl-5 text-sm text-text-secondary">
          {missing.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
