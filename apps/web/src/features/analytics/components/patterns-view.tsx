"use client";

import { PageContainer, PageHeader } from "@shared/components/layout";
import { PatternCard } from "./pattern-card";
import { OnboardingNote } from "./onboarding-note";
import { AnalyticsState } from "./analytics-state";
import { onboardingMessage } from "./analytics-evidence";
import { usePatterns, useRequestPatternAnalysis } from "../api/queries";
import { analyticsPeriod } from "../lib/presentation";

export function PatternsView() {
  const period = analyticsPeriod(14);
  const query = usePatterns(period);
  const runAnalysis = useRequestPatternAnalysis(period);
  const data = query.data;
  const showCards = !query.isPending && !query.isError && data?.state === "ok" && data.patterns.length > 0;
  const stateData = data?.state === "ok" && !data.patterns.length ? { ...data, state: "no-findings" as const } : data;
  const onboarding = showCards ? null : onboardingMessage(data?.diagnostics?.recordingHistory);

  return (
    <PageContainer>
      <PageHeader
        title="Patterns"
        subtitle="What tends to happen around your work."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Patterns" }]}
      />
      <div className="space-y-4">
        {showCards ? (
          data.patterns.map((pattern, index) => (
            <PatternCard
              key={`${period.from}-${period.to}-${pattern.metadata?.patternId ?? pattern.id ?? index}`}
              pattern={pattern}
            />
          ))
        ) : onboarding ? (
          <OnboardingNote message={onboarding} />
        ) : null}
        {!showCards && (
          <AnalyticsState
            isLoading={query.isPending}
            isError={query.isError}
            isFetching={query.isFetching}
            data={stateData}
            onRetry={() => void query.refetch()}
            onRunAnalysis={() => runAnalysis.mutate()}
            isRunningAnalysis={runAnalysis.isPending}
          />
        )}
      </div>
    </PageContainer>
  );
}
