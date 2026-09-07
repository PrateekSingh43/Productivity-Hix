"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Plus,
  CheckCircle2,
  Circle,
  Monitor,
  Globe,
  Radio,
  Clock,
  Play,
} from "lucide-react";
import { PageContainer } from "../../components/layout/page-container";
import { PageHeader } from "../../components/layout/page-header";
import { Section } from "../../components/layout/section";
import { SectionHeader } from "../../components/layout/section-header";
import { GoalCard, GoalCardState } from "../../components/primitives/goal-card";
import { CurrentFocusCard } from "../../components/primitives/current-focus-card";
import { EmptyState } from "../../components/primitives/empty-state";
import { useTasks, useActivitySummary } from "../../src/hooks/queries/use-dashboard";
import { useLiveTelemetry } from "../../src/hooks/use-live-telemetry";

export default function TodayPage() {
  // GoalCard presentation state
  const [goalState, setGoalState] = useState<GoalCardState>("planned");
  const [goalTitle, setGoalTitle] = useState("Ship Phase 2 Design System Primitives");
  const [priorities, setPriorities] = useState([
    "Build presentation primitives and layout shells",
    "Establish accessible keyboard focus and reduced-motion tokens",
    "Prototype extension 5-tab visual workflows",
  ]);
  const [goalOutcome, setGoalOutcome] = useState<
    "Achieved" | "Partially achieved" | "Not achieved" | "Not assessed"
  >("Not assessed");

  // Focus Session execution state
  const [sessionActive, setSessionActive] = useState(false);
  const [activeTask, setActiveTask] = useState<string | null>(null);

  const tasksQuery = useTasks();
  const activityQuery = useActivitySummary();
  const telemetry = useLiveTelemetry();

  const tasks = tasksQuery.data ?? [];

  // Date context
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const totalActiveMinutes = activityQuery.data?.activeTime
    ? Math.round(activityQuery.data.activeTime / 60)
    : null;

  const handleChooseTask = () => {
    const el = document.getElementById("tasks-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    } else if (tasks.length > 0) {
      setActiveTask(tasks[0].title);
    }
  };

  return (
    <PageContainer>
      {/* Quiet, operational Today header — no dev controls */}
      <PageHeader
        title="Today"
        subtitle={dateStr}
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Today" },
        ]}
      />

      {/* 1. Daily Goal Card (Top visual hierarchy) */}
      <Section>
        <GoalCard
          state={goalState}
          goalTitle={goalTitle}
          priorities={priorities}
          outcome={goalOutcome}
          onPlanToday={() => setGoalState("editable")}
          onEdit={() => setGoalState("editable")}
          onSave={(newGoal, newPriorities) => {
            setGoalTitle(newGoal);
            setPriorities(newPriorities);
            setGoalState("planned");
          }}
          onCancel={() => setGoalState(goalTitle ? "planned" : "unplanned")}
          onAssessOutcome={(o) => {
            if (goalState !== "outcome-pending") {
              setGoalState("outcome-pending");
            } else {
              setGoalOutcome(o);
              setGoalState("outcome-assessed");
            }
          }}
        />
      </Section>

      {/* 2. Current Focus / Session Block (NOW layer) */}
      <Section>
        <CurrentFocusCard
          isActive={sessionActive}
          taskTitle={activeTask || undefined}
          taskPriority={activeTask ? "HIGH" : undefined}
          supportingPriority={activeTask && priorities.length > 0 ? priorities[0] : undefined}
          elapsedSeconds={sessionActive ? 1420 : 0}
          observedApplication={telemetry.activeApp || undefined}
          observedTitle={telemetry.windowTitle || undefined}
          observedType={telemetry.activeDomain ? "browser" : "desktop"}
          onChooseTask={handleChooseTask}
          onStartFocus={() => setSessionActive(true)}
          onPause={() => setSessionActive(false)}
          onResume={() => setSessionActive(true)}
          onComplete={() => {
            setSessionActive(false);
            setActiveTask(null);
          }}
        />
      </Section>

      {/* 3. Today's Tasks (Grouped by intention) */}
      <Section id="tasks-section">
        <SectionHeader
          title="TODAY'S TASKS"
          description="Concrete action items supporting today's plan or independent work"
        />

        {tasks.length > 0 ? (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] hover:border-[var(--foreground-muted)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label={`Toggle task: ${task.title}`}
                    className="text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)]"
                  >
                    {task.status === "done" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Circle className="w-4 h-4" />
                    )}
                  </button>
                  <span
                    className={`text-xs ${
                      task.status === "done"
                        ? "line-through text-[var(--foreground-muted)]"
                        : "text-[var(--foreground-primary)]"
                    }`}
                  >
                    {task.title}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--background-subtle)] text-[var(--foreground-muted)] border border-[var(--border-subtle)]">
                    Daily Priority 1
                  </span>
                  {!sessionActive && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTask(task.title);
                        setSessionActive(true);
                      }}
                      className="inline-flex items-center gap-1 text-xs text-[var(--foreground-primary)] hover:opacity-90 px-2.5 py-1 rounded bg-[var(--background-subtle)] border border-[var(--border-subtle)]"
                    >
                      <Play size={11} className="fill-current" />
                      <span>Start Focus</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No Tasks for Today"
            description="Create tasks for today's work. They can support a Daily Priority or Goal, or remain independent."
          />
        )}
      </Section>

      {/* 4. Today's Reality (Observational Telemetry Layer) */}
      <Section>
        <SectionHeader
          title="TODAY'S REALITY"
          description="Objective telemetry reported from desktop and browser collectors — Intention vs Observation"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[var(--foreground-muted)]">
                Observed duration
              </span>
              <Clock className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
            </div>
            <div className="text-xl font-semibold font-mono text-[var(--foreground-primary)]">
              {totalActiveMinutes !== null && totalActiveMinutes > 0
                ? `${totalActiveMinutes}m`
                : totalActiveMinutes === 0
                ? "0m"
                : "—"}
            </div>
            <p className="text-[11px] text-[var(--foreground-muted)] mt-1">
              Desktop + Browser observed time
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[var(--foreground-muted)]">
                Desktop application
              </span>
              <Monitor className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
            </div>
            <div className="text-sm font-medium text-[var(--foreground-primary)] truncate">
              {telemetry.activeApp || "No foreground application"}
            </div>
            <p className="text-[11px] text-[var(--foreground-muted)] truncate mt-1">
              {telemetry.windowTitle || "Waiting for signal..."}
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[var(--foreground-muted)]">
                Browser activity
              </span>
              <Globe className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
            </div>
            <div className="text-sm font-medium text-[var(--foreground-primary)] truncate">
              {telemetry.activeDomain || "No active domain"}
            </div>
            <p className="text-[11px] text-[var(--foreground-muted)] truncate mt-1">
              {telemetry.activeTabTitle || "Waiting for signal..."}
            </p>
          </div>
        </div>
      </Section>
    </PageContainer>
  );
}
