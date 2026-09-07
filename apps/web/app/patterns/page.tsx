"use client";

import { PageContainer } from "../../components/layout/page-container";
import { PageHeader } from "../../components/layout/page-header";
import { Section } from "../../components/layout/section";
import { InsufficientDataState } from "../../components/primitives/insufficient-data-state";

export default function PatternsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Patterns"
        subtitle="Evidence-based behavioral rules and blocker correlations"
        breadcrumbs={[
          { label: "ProductiveHix", href: "/" },
          { label: "Patterns" },
        ]}
      />

      <Section>
        <InsufficientDataState
          title="Insufficient Data for Pattern Synthesis"
          description="Synthesizing concrete correlation patterns (such as morning velocity vs. afternoon context switching) requires at least 14 days of historical session and telemetry signals."
          daysRecorded={0}
          daysRequired={14}
          dataPointName="productive days"
        />
      </Section>
    </PageContainer>
  );
}
