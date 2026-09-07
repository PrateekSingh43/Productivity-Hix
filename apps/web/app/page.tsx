"use client";

import React from "react";
import Link from "next/link";
import {
  Activity,
  Target,
  CheckCircle2,
  Brain,
  ArrowRight,
  Sparkles,
  Monitor,
  Globe,
} from "lucide-react";
import { PageContainer } from "../components/layout/page-container";
import { PageHeader } from "../components/layout/page-header";
import { Section } from "../components/layout/section";
import { SectionHeader } from "../components/layout/section-header";
import { StatCard } from "../components/primitives/stat-card";
import { DataBadge } from "../components/primitives/data-badge";
import {
  useActivitySummary,
  useDailyAnalytics,
  useTasks,
} from "../src/hooks/queries/use-dashboard";
import { useLiveTelemetry } from "../src/hooks/use-live-telemetry";

export default function HomePage() {
  const tasksQuery = useTasks();
  const activityQuery = useActivitySummary();
  const analyticsQuery = useDailyAnalytics();
  const telemetry = useLiveTelemetry();

  const tasks = tasksQuery.data ?? [];
  const completedTasks = tasks.filter((t) => t.status === "done");
  const activity = activityQuery.data;

  // Real observed active minutes from telemetry
  const totalActiveMinutes = activity?.activeTime
    ? Math.round(activity.activeTime / 60)
    : null;
  const activeDisplay =
    totalActiveMinutes !== null && totalActiveMinutes > 0
      ? totalActiveMinutes >= 60
        ? `${Math.floor(totalActiveMinutes / 60)}h ${totalActiveMinutes % 60}m`
        : `${totalActiveMinutes}m`
      : totalActiveMinutes === 0
      ? "0m"
      : "—";

  const sessionCount =
    analyticsQuery.data?.activity?.sessions ?? activity?.sessions ?? 0;

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <PageContainer>
      <PageHeader
        title="Home"
        subtitle={dateStr}
        breadcrumbs={[{ label: "Home" }]}
        actions={
          <Link
            href="/today"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--foreground-primary)] text-[var(--background-primary)] hover:opacity-90 transition-opacity"
          >
            Go to Today <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        }
      />

      {/* Row 1: Glanceable Metrics with Honest States */}
      <Section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Observed Activity"
            value={activeDisplay}
            subtext="Desktop + Browser telemetry"
            state={
              activityQuery.isLoading
                ? "loading"
                : totalActiveMinutes !== null
                ? "ready"
                : "empty"
            }
            icon={Activity}
          />

          <StatCard
            label="Focus Sessions"
            value={sessionCount}
            subtext="Deliberate execution blocks"
            state={
              analyticsQuery.isLoading || activityQuery.isLoading
                ? "loading"
                : sessionCount > 0
                ? "ready"
                : "empty"
            }
            icon={Target}
          />

          <StatCard
            label="Planned Tasks"
            value={
              tasks.length > 0
                ? `${completedTasks.length} / ${tasks.length}`
                : "0"
            }
            subtext={
              tasks.length > 0
                ? `${completedTasks.length} completed`
                : "No tasks planned yet"
            }
            state={
              tasksQuery.isLoading
                ? "loading"
                : tasks.length > 0
                ? "ready"
                : "empty"
            }
            icon={CheckCircle2}
          />

          <StatCard
            label="Reviews Due"
            value="0 due"
            subtext="No recall reviews due"
            state="empty"
            icon={Brain}
          />
        </div>
      </Section>

      {/* Row 2: Today's Plan Summary & Live Activity Glance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Today's Plan Summary (Read-Only Glance) */}
        <div className="lg:col-span-7">
          <Section className="h-full">
            <SectionHeader
              title="TODAY'S INTENTION"
              description="Declared primary objective and priorities for today"
              action={
                <Link
                  href="/today"
                  className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] flex items-center gap-1 transition-colors"
                >
                  Manage in Today <ArrowRight className="w-3 h-3" aria-hidden="true" />
                </Link>
              }
            />

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-[var(--foreground-primary)]">
                  Daily Goal
                </span>
                <DataBadge label="Not Planned" variant="neutral" />
              </div>

              <p className="text-sm text-[var(--foreground-muted)] mb-4">
                No daily goal defined for today. Setting a single clear intent
                guides focus and provides a benchmark for evening reflection.
              </p>

              <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                <span className="text-xs text-[var(--foreground-muted)]">
                  Daily priorities: <strong className="text-[var(--foreground-primary)] font-normal">No priorities set</strong>
                </span>
                <Link
                  href="/today"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--foreground-primary)] hover:underline"
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Plan Today
                </Link>
              </div>
            </div>
          </Section>
        </div>

        {/* Live Observational Activity Signal */}
        <div className="lg:col-span-5">
          <Section className="h-full">
            <SectionHeader
              title="CURRENT OBSERVED SIGNAL"
              description="Objective telemetry reported from desktop and browser collectors"
            />

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-5 space-y-3">
              {/* Desktop Telemetry */}
              <div className="p-3 rounded-md bg-[var(--background-subtle)] border border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] mb-1">
                  <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Desktop application</span>
                </div>
                <p className="text-xs font-medium text-[var(--foreground-primary)] truncate">
                  {telemetry.activeApp || "No foreground application reported"}
                </p>
                {telemetry.windowTitle && (
                  <p className="text-[11px] text-[var(--foreground-muted)] truncate mt-0.5">
                    {telemetry.windowTitle}
                  </p>
                )}
              </div>

              {/* Browser Telemetry */}
              <div className="p-3 rounded-md bg-[var(--background-subtle)] border border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] mb-1">
                  <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Browser activity</span>
                </div>
                <p className="text-xs font-medium text-[var(--foreground-primary)] truncate">
                  {telemetry.activeDomain || "No active domain reported"}
                </p>
                {telemetry.activeTabTitle && (
                  <p className="text-[11px] text-[var(--foreground-muted)] truncate mt-0.5">
                    {telemetry.activeTabTitle}
                  </p>
                )}
              </div>
            </div>
          </Section>
        </div>
      </div>
    </PageContainer>
  );
}
