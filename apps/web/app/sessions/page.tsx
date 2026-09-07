"use client";

import React from "react";
import { PageContainer } from "../../components/layout/page-container";
import { PageHeader } from "../../components/layout/page-header";
import { Section } from "../../components/layout/section";
import { SectionHeader } from "../../components/layout/section-header";
import { StatCard } from "../../components/primitives/stat-card";
import { EmptyState } from "../../components/primitives/empty-state";
import { Clock, Zap, Target, History } from "lucide-react";

export default function SessionsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Sessions"
        subtitle="Deliberate execution blocks — comparing intention to observed telemetry and outcomes"
        breadcrumbs={[
          { label: "ProductiveHix", href: "/" },
          { label: "Sessions" },
        ]}
      />

      {/* Metric Summary - Honest empty/zero states */}
      <Section>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Total Sessions"
            value={0}
            subtext="No sessions completed today"
            state="empty"
            icon={Zap}
          />
          <StatCard
            label="Avg Duration"
            value="—"
            subtext="Calculated across completed blocks"
            state="empty"
            icon={Clock}
          />
          <StatCard
            label="Task Alignment"
            value="—"
            subtext="Linked to planned priorities"
            state="empty"
            icon={Target}
          />
        </div>
      </Section>

      {/* Session History */}
      <Section>
        <SectionHeader
          title="Session History"
          description="Detailed logs of deliberate focus blocks, self-reported blockers, and observed activity"
        />
        <EmptyState
          icon={History}
          title="No Sessions Recorded Yet"
          description="Start a focus session from the Today view or browser extension to begin capturing deliberate work periods and comparing intention with telemetry."
        />
      </Section>
    </PageContainer>
  );
}
