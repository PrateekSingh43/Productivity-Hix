"use client";

import { PageContainer } from "../../components/layout/page-container";
import { PageHeader } from "../../components/layout/page-header";
import { Section } from "../../components/layout/section";
import { EmptyState } from "../../components/primitives/empty-state";
import { CheckCircle2 } from "lucide-react";

export default function ReviewPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Review"
        subtitle="Delayed recall validation and retention prompts"
        breadcrumbs={[
          { label: "ProductiveHix", href: "/" },
          { label: "Review" },
        ]}
      />

      <Section>
        <EmptyState
          icon={CheckCircle2}
          title="No Reviews Due"
          description="You are completely caught up. When tracked topics from your study or focus sessions reach their scheduled recall interval, they will appear here."
        />
      </Section>
    </PageContainer>
  );
}
