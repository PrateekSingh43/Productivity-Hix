"use client";

import { useEffect, useState } from "react";
import { PageContainer, PageHeader } from "@shared/components/layout";
import { PatternCard } from "./pattern-card";
import { AnalyticsState } from "./analytics-state";
import { EarlyObservationCard } from "./early-observation-card";
import { PatternEvidenceSummary } from "./pattern-evidence-summary";
import { EvidenceLimitations } from "./evidence-limitations";
import { PatternAnalysisMeta } from "./pattern-analysis-meta";
import { usePatterns, useRequestPatternAnalysis } from "../api/queries";
import { analyticsPeriod, dateLabel } from "../lib/presentation";
import type { EarlySignal } from "../types";

/** A RUNNING run older than this is presumed stuck: offer retry instead of polling forever. */
const RUNNING_TIMEOUT_MS = 10 * 60 * 1000;

type WindowDays = 14 | 30;

/**
 * Personal behavioral research — not a pipeline console.
 *
 * Hierarchy: what we know (evidence summary) → what we're seeing (early
 * observations / qualified patterns) → why stronger claims aren't available
 * (disclosure) → supporting evidence (inside cards) → technical status
 * (quiet footer). AnalyticsState owns loading/error/NO_RUN/RUNNING/FAILED
 * and the thin states; the insufficient-evidence and ok compositions live
 * here so the most useful information stays visually dominant.
 */
export function PatternsView() {
  const [windowDays, setWindowDays] = useState<WindowDays>(14);
  const period = analyticsPeriod(windowDays);
  const query = usePatterns(period);
  const runAnalysis = useRequestPatternAnalysis(period);
  const data = query.data;
  const showCards = !query.isPending && !query.isError && data?.state === "ok" && data.patterns.length > 0;
  const isInsufficient = !query.isPending && !query.isError && data?.state === "insufficient-evidence";
  const earlySignals: EarlySignal[] = isInsufficient
    ? (data?.earlySignals ?? []).filter((signal) => signal.confidence === "low")
    : [];
  const periodLabel = `${dateLabel(period.from)} – ${dateLabel(period.to)}`;

  // RUNNING watchdog: a run row with no terminal state for 10+ minutes means
  // the worker died mid-run (no server-side reaper exists). Stop asserting
  // "still calculating" and offer recovery actions instead.
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (data?.state === "RUNNING" && runningSince === null) setRunningSince(Date.now());
    if (data?.state !== "RUNNING" && runningSince !== null) setRunningSince(null);
  }, [data?.state, runningSince]);
  useEffect(() => {
    if (data?.state !== "RUNNING") return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [data?.state]);
  const runningTimedOut = runningSince !== null && now - runningSince > RUNNING_TIMEOUT_MS;
  const runError = runAnalysis.error instanceof Error ? runAnalysis.error.message : runAnalysis.error ? String(runAnalysis.error) : null;

  return (
    <PageContainer maxWidth="lg">
      <PageHeader
        title="Patterns"
        subtitle="Recurring things showing up in your work."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Patterns" }]}
        dateContext={periodLabel}
        actions={
          <div role="group" aria-label="Analysis window" className="flex items-center gap-1 rounded-[var(--radius-md)] border border-border-subtle bg-bg-secondary p-1">
            {([14, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={windowDays === days}
                onClick={() => setWindowDays(days)}
                className={`min-h-9 rounded-[var(--radius-sm)] px-3 text-xs font-medium transition-colors ${
                  windowDays === days
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {days} days
              </button>
            ))}
          </div>
        }
      />
      {query.isPending ? (
        <div role="status" aria-label="Loading patterns" className="space-y-4">
          <span className="sr-only">Loading patterns</span>
          <div aria-hidden="true" className="space-y-2 py-1 motion-safe:animate-pulse">
            <div className="h-3 w-40 rounded bg-bg-secondary" />
            <div className="h-6 w-64 rounded bg-bg-secondary" />
            <div className="h-3 w-full max-w-xl rounded bg-bg-secondary" />
          </div>
          {[0, 1].map((item) => (
            <div
              key={item}
              aria-hidden="true"
              className="space-y-3 rounded-[var(--radius-lg)] border border-border-subtle bg-bg-card p-5 motion-safe:animate-pulse"
            >
              <div className="h-3 w-32 rounded bg-bg-secondary" />
              <div className="h-5 w-3/4 rounded bg-bg-secondary" />
              <div className="h-3 w-full rounded bg-bg-secondary" />
              <div className="h-3 w-1/2 rounded bg-bg-secondary" />
            </div>
          ))}
        </div>
      ) : showCards ? (
        <div className="space-y-4">
          {data.patterns.map((pattern, index) => (
            <PatternCard
              key={`${period.from}-${period.to}-${pattern.metadata?.patternId ?? pattern.id ?? index}`}
              pattern={pattern}
            />
          ))}
          <PatternAnalysisMeta
            computedAt={data.computedAt}
            periodLabel={periodLabel}
          />
        </div>
      ) : isInsufficient ? (
        <div className="space-y-6">
          <PatternEvidenceSummary
            diagnostics={data?.diagnostics}
            recordingHistory={data?.diagnostics?.recordingHistory ?? null}
            hasEarlyObservations={earlySignals.length > 0}
          />
          {earlySignals.length > 0 && (
            <div className="space-y-3">
              {earlySignals.map((signal) => (
                <EarlyObservationCard key={signal.detectorIdentity} signal={signal} />
              ))}
            </div>
          )}
          <EvidenceLimitations diagnostics={data?.diagnostics} />
          <PatternAnalysisMeta
            computedAt={data?.computedAt}
            periodLabel={periodLabel}
            onRecheck={() => runAnalysis.mutate()}
            rechecking={runAnalysis.isPending}
          />
        </div>
      ) : (
        <AnalyticsState
          isLoading={false}
          isError={query.isError}
          isFetching={query.isFetching}
          data={data?.state === "ok" && !data.patterns.length ? { ...data, state: "no-findings" as const } : data}
          onRetry={() => void query.refetch()}
          onRunAnalysis={() => runAnalysis.mutate()}
          isRunningAnalysis={runAnalysis.isPending}
          runError={runError}
          runningTimedOut={runningTimedOut}
        />
      )}
    </PageContainer>
  );
}
