"use client";

import { PageContainer, PageHeader } from "@shared/components/layout";
import { InsightCard } from "./insight-card";
import { OnboardingNote } from "./onboarding-note";
import { AnalyticsState } from "./analytics-state";
import { onboardingMessage } from "./analytics-evidence";
import { useInsights } from "../api/queries";
import { analyticsPeriod } from "../lib/presentation";

export function InsightsView() {
  const period = analyticsPeriod(14);
  const query = useInsights(period);
  const data = query.data;
  const insights = data?.insights.filter((insight) => !insight.status || insight.status === "DETECTED") ?? [];
  const showCards = !query.isPending && !query.isError && data?.state === "ok" && insights.length > 0;
  const noInsight = data?.state === "ok" && insights.length === 0;
  const onboarding = showCards || noInsight ? null : onboardingMessage(data?.diagnostics?.recordingHistory);

  return (
    <PageContainer>
      <PageHeader
        title="Insights"
        subtitle="What your records suggest about work that matters to you."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Insights" }]}
      />
      <div className="space-y-4">
        {showCards ? (
          insights.map((insight, index) => (
            <InsightCard
              key={`${period.from}-${period.to}-${insight.id ?? index}`}
              insight={insight}
              period={data.window ?? period}
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
            data={data}
            noInsight={noInsight}
            onRetry={() => void query.refetch()}
          />
        )}
      </div>
    </PageContainer>
  );
}
