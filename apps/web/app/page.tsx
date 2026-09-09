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
  Radio,
  Play,
  Clock,
} from "lucide-react";
import { PageContainer } from "../components/layout/page-container";
import { PageHeader } from "../components/layout/page-header";
import { Section } from "../components/layout/section";
import { SectionHeader } from "../components/layout/section-header";
import {
  useActivitySummary,
  useDailyAnalytics,
  useTasks,
} from "../src/hooks/queries/use-dashboard";
import { useTodayPlan } from "../src/hooks/queries/use-plans";
import { useSessionsList } from "../src/hooks/queries/use-tasks";
import { useLiveTelemetry } from "../src/hooks/use-live-telemetry";

export default function HomePage() {
  const tasksQuery = useTasks();
  const activityQuery = useActivitySummary();
  const analyticsQuery = useDailyAnalytics();
  const planQuery = useTodayPlan();
  const sessionsQuery = useSessionsList();
  const telemetry = useLiveTelemetry();

  const tasks = tasksQuery.data ?? [];
  const completedTasks = tasks.filter((t) => t.status === "done");
  const activity = activityQuery.data;
  const plan = planQuery.data;
  const goals = plan?.goals ?? [];
  const primaryGoal = goals[0];
  const sessions = sessionsQuery.data ?? [];
  const activeSession = sessions.find((s) => !s.endedAt);
  const activeTask = activeSession?.taskId
    ? tasks.find((t) => t.id === activeSession.taskId)
    : null;

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
      {/* 1. Header with Calm Date Context & Direct Action */}
      <PageHeader
        title="Home"
        subtitle="Daily overview — aligning deliberate intention with observed activity"
        dateContext={dateStr}
        breadcrumbs={[{ label: "Home" }]}
        actions={
          <Link
            href="/today"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-text-primary text-bg-primary hover:opacity-90 transition-opacity cursor-pointer"
          >
            <span>Open Today</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        }
      />

      {/* 2. COMMAND CENTER ANCHOR: Today's Primary Intention & Live Execution State */}
      <div className="rounded-xl border border-border-subtle bg-bg-card p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left Column (7 cols): What matters about my current day? */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-text-muted">
                Today's Primary Objective
              </span>
              {primaryGoal && (
                <span className="text-xs font-mono font-medium px-1.5 py-0.5 rounded bg-bg-secondary text-text-secondary border border-border-subtle">
                  Goal 1 of {goals.length}
                </span>
              )}
            </div>

            {primaryGoal ? (
              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-text-primary leading-tight">
                  {primaryGoal.title}
                </h2>
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                  <span>
                    Tasks supporting:{" "}
                    <strong className="text-text-primary font-medium">
                      {completedTasks.length} of {tasks.length} done
                    </strong>
                  </span>
                  <span className="text-border-subtle">•</span>
                  <Link
                    href="/today"
                    className="text-text-primary hover:text-text-secondary font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>Manage in Today</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-tight text-text-primary">
                  Day not planned yet
                </h2>
                <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-lg">
                  Setting 1–3 concrete objectives anchors deliberate focus and provides a clear baseline for reflection.
                </p>
                <div className="pt-1">
                  <Link
                    href="/today"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-[var(--radius-sm)] bg-bg-secondary border border-border-subtle text-text-primary hover:border-border-hover transition-colors cursor-pointer"
                  >
                    <Sparkles size={13} className="text-text-muted" />
                    <span>Plan Today's Goals</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Right Column (5 cols): Current Execution State */}
          <div className="lg:col-span-5 lg:border-l lg:border-border-subtle lg:pl-8 space-y-3">
            <span className="text-xs font-medium text-text-muted block">
              Current Execution State
            </span>

            {activeSession ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Active Focus Session
                  </span>
                </div>
                <p className="text-sm font-semibold text-text-primary truncate">
                  {activeTask?.title || activeSession.notes || "Deliberate Execution Block"}
                </p>
                <div className="flex items-center gap-2 text-xs text-text-secondary pt-1">
                  <Link
                    href="/sessions"
                    className="text-emerald-600 dark:text-emerald-400 hover:opacity-80 font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Inspect active session</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
                  <span>No active session</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {telemetry.activeDomain
                    ? `Current foreground: ${telemetry.activeDomain}`
                    : telemetry.activeApp
                    ? `Current foreground: ${telemetry.activeApp}`
                    : "Desktop & browser collectors ready"}
                </p>
                <div className="pt-1">
                  <Link
                    href="/sessions"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-text-primary hover:text-text-secondary transition-colors cursor-pointer"
                  >
                    <Play size={11} className="fill-current" />
                    <span>Start Focus Block</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. SUPPORTING METRIC RIBBON (Integrated flat strip, no duplicate boxes) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 rounded-xl border border-border-subtle bg-bg-card divide-y lg:divide-y-0 lg:divide-x divide-border-subtle overflow-hidden">
        {/* Metric 1: Observed Activity */}
        <div className="p-4 sm:p-5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">Observed Activity</span>
            <Activity size={14} className="text-text-muted" aria-hidden="true" />
          </div>
          <div className="text-xl sm:text-2xl font-semibold font-mono tracking-tight text-text-primary tabular-nums">
            {activeDisplay}
          </div>
          <p className="text-[11px] text-text-muted">Desktop + Browser time</p>
        </div>

        {/* Metric 2: Focus Sessions */}
        <div className="p-4 sm:p-5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">Focus Sessions</span>
            <Target size={14} className="text-text-muted" aria-hidden="true" />
          </div>
          <div className="text-xl sm:text-2xl font-semibold font-mono tracking-tight text-text-primary tabular-nums">
            {sessionCount}
          </div>
          <p className="text-[11px] text-text-muted">Completed deliberate blocks</p>
        </div>

        {/* Metric 3: Planned Tasks */}
        <div className="p-4 sm:p-5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">Tasks Completed</span>
            <CheckCircle2 size={14} className="text-text-muted" aria-hidden="true" />
          </div>
          <div className="text-xl sm:text-2xl font-semibold font-mono tracking-tight text-text-primary tabular-nums">
            {tasks.length > 0 ? `${completedTasks.length} / ${tasks.length}` : "0"}
          </div>
          <p className="text-[11px] text-text-muted">
            {tasks.length > 0 ? `${Math.round((completedTasks.length / tasks.length) * 100)}% intention fulfilled` : "No tasks planned yet"}
          </p>
        </div>

        {/* Metric 4: Reviews Due */}
        <div className="p-4 sm:p-5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">Spaced Reviews</span>
            <Brain size={14} className="text-text-muted" aria-hidden="true" />
          </div>
          <div className="text-xl sm:text-2xl font-semibold font-mono tracking-tight text-text-muted tabular-nums">
            0 due
          </div>
          <p className="text-[11px] text-text-muted">Recall items scheduled</p>
        </div>
      </div>

      {/* 4. CURRENT OBSERVED TELEMETRY EVIDENCE (Flat 2-column layout, no card-in-card) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-base font-semibold tracking-tight text-text-primary">
              Observed Activity Signal
            </h3>
            <p className="text-xs text-text-secondary">
              Objective telemetry continuously reported from local desktop and browser collectors
            </p>
          </div>
          <Link
            href="/timeline"
            className="text-xs text-text-secondary hover:text-text-primary inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>View Timeline Evidence</span>
            <ArrowRight size={12} />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 rounded-xl border border-border-subtle bg-bg-card divide-y md:divide-y-0 md:divide-x divide-border-subtle overflow-hidden">
          {/* Desktop Collector Signal */}
          <div className="p-4 sm:p-5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-text-muted">
                <Monitor size={14} />
                <span className="font-medium">Desktop Application</span>
              </div>
              <span className="text-[10px] font-mono text-text-muted">
                {telemetry.secondsAgo !== null ? `${telemetry.secondsAgo}s ago` : "listening"}
              </span>
            </div>
            <p className="text-sm font-medium text-text-primary truncate">
              {telemetry.activeApp || "No foreground application active"}
            </p>
            {telemetry.windowTitle && (
              <p className="text-xs text-text-secondary truncate">
                {telemetry.windowTitle}
              </p>
            )}
          </div>

          {/* Browser Collector Signal */}
          <div className="p-4 sm:p-5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-text-muted">
                <Globe size={14} />
                <span className="font-medium">Browser Activity</span>
              </div>
              <span className="text-[10px] font-mono text-text-muted">
                {telemetry.connected ? "connected" : "offline"}
              </span>
            </div>
            <p className="text-sm font-medium text-text-primary truncate">
              {telemetry.activeDomain || "No active domain reported"}
            </p>
            {telemetry.activeTabTitle && (
              <p className="text-xs text-text-secondary truncate">
                {telemetry.activeTabTitle}
              </p>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
