"use client";

import { PageContainer, PageHeader, Section } from "@shared/components/layout";
import { EmptyState } from "@shared/components/primitives";
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
