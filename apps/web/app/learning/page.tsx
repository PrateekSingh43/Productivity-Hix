"use client";

import { PageContainer } from "../../components/layout/page-container";
import { PageHeader } from "../../components/layout/page-header";
import { Section } from "../../components/layout/section";
import { EmptyState } from "../../components/primitives/empty-state";
import { BookOpen } from "lucide-react";

export default function LearningPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Learning"
        subtitle="Knowledge retention and technical topic tracking"
        breadcrumbs={[
          { label: "ProductiveHix", href: "/" },
          { label: "Learning" },
        ]}
      />

      <Section>
        <EmptyState
          icon={BookOpen}
          title="No Learning Topics Yet"
          description="Track technical topics and concepts studied during deep work sessions to retain knowledge through spaced recall intervals."
        />
      </Section>
    </PageContainer>
  );
}
