"use client";

import { PageContainer } from "../../components/layout/page-container";
import { PageHeader } from "../../components/layout/page-header";
import { Section } from "../../components/layout/section";
import { InsufficientDataState } from "../../components/primitives/insufficient-data-state";

export default function InsightsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Insights"
        subtitle="Behavioral analytics, focus windows, and historical cognitive rhythm"
        breadcrumbs={[
          { label: "ProductiveHix", href: "/" },
          { label: "Insights" },
        ]}
      />

      <Section>
        <InsufficientDataState
          title="Insufficient Data for Insights Synthesis"
          description="Long-term behavioral insights, focus windows, and cognitive fatigue points require at least 7 days of continuous observation before synthesis can begin."
          daysRecorded={0}
          daysRequired={7}
          dataPointName="productive days"
        />
      </Section>
    </PageContainer>
  );
}
