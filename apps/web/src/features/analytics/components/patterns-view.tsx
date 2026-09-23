"use client";

import { PageContainer, PageHeader } from "@shared/components/layout";
import { PatternCard } from "./pattern-card";
import { AnalyticsState } from "./analytics-state";
import { ReadinessStrip } from "./readiness-strip";
import { usePatterns, useRequestPatternAnalysis } from "../api/queries";
import { analyticsPeriod } from "../lib/presentation";

/**
 * Single primary state machine (§28): exactly one of cards / loading /
 * error / state card is rendered. ReadinessStrip is secondary diagnostics
 * and may appear below the primary surface. OnboardingNote is intentionally
 * not rendered here — AnalyticsState owns all empty/insufficient copy so two
 * competing explanations can never appear together.
 */
export function PatternsView() {
  const period = analyticsPeriod(14);
  const query = usePatterns(period);
  const runAnalysis = useRequestPatternAnalysis(period);
  const data = query.data;
  const showCards = !query.isPending && !query.isError && data?.state === "ok" && data.patterns.length > 0;
  const stateData = data?.state === "ok" && !data.patterns.length ? { ...data, state: "no-findings" as const } : data;

  return (
    <PageContainer>
      <PageHeader
        title="Patterns"
        subtitle="What tends to happen around your work."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Patterns" }]}
      />
      <div className="space-y-4">
        {showCards ? (
          <>
            {data.patterns.map((pattern, index) => (
              <PatternCard
                key={`${period.from}-${period.to}-${pattern.metadata?.patternId ?? pattern.id ?? index}`}
                pattern={pattern}
              />
            ))}
            <ReadinessStrip readiness={data.readiness} />
          </>
        ) : (
          <>
            <AnalyticsState
              isLoading={query.isPending}
              isError={query.isError}
              isFetching={query.isFetching}
              data={stateData}
              onRetry={() => void query.refetch()}
              onRunAnalysis={() => runAnalysis.mutate()}
              isRunningAnalysis={runAnalysis.isPending}
            />
            {!query.isPending && !query.isError && stateData && (
              <ReadinessStrip readiness={stateData.readiness} />
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
