"use client";

import { useState, useMemo } from "react";
import {
  Flame,
  PlayCircle,
  ListTodo,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Calendar,
  Clock,
  Check,
} from "lucide-react";
import type { Task } from "@repo/types";
import { format } from "date-fns";
import { useTasksList, useSessionsList } from "../../src/hooks/queries/use-tasks";
import { ActiveSessionBanner } from "./active-session-banner";
import { TaskQuickAdd } from "./task-quick-add";
import { TaskItem } from "./task-item";
import { TaskDetailDrawer } from "./task-detail-drawer";
import { PageContainer } from "../layout/page-container";
import { PageHeader } from "../layout/page-header";
import { Section } from "../layout/section";
import { SectionHeader } from "../layout/section-header";

type FilterTab = "today" | "incomplete" | "in_progress" | "completed" | "all";

export function TaskPageClient() {
  const { data: tasks = [], isLoading: isLoadingTasks } = useTasksList();
  const { data: sessions = [] } = useSessionsList();

  const [filterTab, setFilterTab] = useState<FilterTab>("today");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);

  // Keep selectedTask in sync with fresh query data
  const activeSelectedTask = useMemo(() => {
    if (!selectedTask) return null;
    return tasks.find((t) => t.id === selectedTask.id) || selectedTask;
  }, [tasks, selectedTask]);

  // Calculate planned time for incomplete tasks
  const plannedMinutes = useMemo(() => {
    return tasks
      .filter((t) => t.status !== "done" && t.status !== "cancelled")
      .reduce((acc, t) => acc + (t.plannedDurationMinutes || 0), 0);
  }, [tasks]);

  // Calculate actual time from all tasks
  const actualMinutes = useMemo(() => {
    const seconds = tasks.reduce((acc, t) => acc + (t.actualDurationSeconds || 0), 0);
    return Math.round(seconds / 60);
  }, [tasks]);

  const formatHoursMinutes = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  // Categorize tasks logically
  const { todoTasks, priorities, inProgress, upNext, completed } = useMemo(() => {
    const todos = tasks.filter((t) => t.status === "todo" || t.status === "in_progress");
    const completedTasks = tasks.filter((t) => t.status === "done");

    // 1. TODAY'S PRIORITIES: High priority tasks (capped at 3 to maintain focus!)
    const highTasks = todos.filter((t) => t.priority === "high");
    const topPriorities = highTasks.length >= 3
      ? highTasks.slice(0, 3)
      : [
          ...highTasks,
          ...todos.filter((t) => t.priority !== "high").slice(0, 3 - highTasks.length),
        ];

    const priorityIds = new Set(topPriorities.map((t) => t.id));

    // 2. IN PROGRESS: Tasks with active sessions or in_progress status that aren't in priorities
    const inProg = todos.filter(
      (t) => (t.hasActiveSession || t.status === "in_progress") && !priorityIds.has(t.id),
    );
    const inProgIds = new Set(inProg.map((t) => t.id));

    // 3. UP NEXT: Remaining todo tasks (including rollover / past incomplete tasks)
    const next = todos.filter(
      (t) => !priorityIds.has(t.id) && !inProgIds.has(t.id),
    );

    return {
      todoTasks: todos,
      priorities: topPriorities,
      inProgress: inProg,
      upNext: next,
      completed: completedTasks,
    };
  }, [tasks]);

  const inProgressTotalCount = inProgress.length + (priorities.some((p) => p.hasActiveSession || p.status === "in_progress") ? 1 : 0);

  return (
    <PageContainer>
      {/* 1. Header & Workload Summary */}
      <PageHeader
        title="Tasks"
        subtitle="Deliberate intentions, priorities, and execution tracking"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Tasks" },
        ]}
      />

      {/* 2. Workload Metrics Ribbon */}
      <div className="rounded-xl border border-border-subtle bg-bg-card grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border-subtle overflow-hidden">
        <div className="p-4">
          <span className="text-xs text-text-muted block mb-1">Today</span>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <Calendar size={13} className="text-text-muted shrink-0" />
            <span className="truncate">{format(new Date(), "EEEE, MMM d")}</span>
          </div>
        </div>

        <div className="p-4">
          <span className="text-xs text-text-muted block mb-1">Planned Workload</span>
          <div className="text-lg font-semibold font-mono tabular-nums text-text-primary">
            {formatHoursMinutes(plannedMinutes)}
          </div>
        </div>

        <div className="p-4">
          <span className="text-xs text-text-muted block mb-1">Actual Focus Recorded</span>
          <div className="text-lg font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatHoursMinutes(actualMinutes)}
          </div>
        </div>

        <div className="p-4">
          <span className="text-xs text-text-muted block mb-1">Incomplete Tasks</span>
          <div className="text-lg font-semibold font-mono tabular-nums text-text-primary">
            {todoTasks.length}
          </div>
        </div>
      </div>

      {/* Overcommitment Warning */}
      {plannedMinutes > 360 && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
          <Flame size={14} className="shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="font-semibold text-amber-600 dark:text-amber-400 mb-0.5">Heavy planned workload today</p>
            <p className="text-amber-700/80 dark:text-amber-300/80">
              {formatHoursMinutes(plannedMinutes)} planned. Guidance recommends focusing on 1–3 material priorities.
            </p>
          </div>
        </div>
      )}

      {/* 3. Active Session Live Banner */}
      <ActiveSessionBanner
        sessions={sessions}
        tasks={tasks}
        onSelectTask={(task) => setSelectedTask(task)}
      />

      {/* 4. Quick Add Task Bar */}
      <TaskQuickAdd />

      {/* 5. Filter Tabs Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="bg-bg-secondary p-1 rounded-lg border border-border-subtle inline-flex items-center gap-1 overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setFilterTab("today")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filterTab === "today"
                ? "bg-bg-card text-text-primary border border-border-subtle/60"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Today&apos;s Focus
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("incomplete")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filterTab === "incomplete"
                ? "bg-bg-card text-text-primary border border-border-subtle/60"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Incomplete ({todoTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("in_progress")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filterTab === "in_progress"
                ? "bg-bg-card text-text-primary border border-border-subtle/60"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            In Progress ({inProgressTotalCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("completed")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filterTab === "completed"
                ? "bg-bg-card text-text-primary border border-border-subtle/60"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Completed ({completed.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              filterTab === "all"
                ? "bg-bg-card text-text-primary border border-border-subtle/60"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            All ({tasks.length})
          </button>
        </div>

        <span className="text-xs text-text-muted">
          Click any task to inspect details & focus sessions
        </span>
      </div>

      {/* 6. Main Task Sections */}
      {isLoadingTasks ? (
        <div className="rounded-xl border border-border-subtle bg-bg-card p-12 text-center text-text-muted text-sm animate-pulse">
          Loading tasks and focus records...
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-subtle bg-bg-card p-12 text-center space-y-3">
          <h3 className="text-base font-semibold text-text-primary">No tasks found</h3>
          <p className="text-xs sm:text-sm text-text-muted max-w-sm mx-auto">
            Use the quick add bar above to plan your intentions and action items.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* SECTION A: TODAY'S PRIORITIES */}
          {(filterTab === "today" || filterTab === "incomplete" || filterTab === "all") && priorities.length > 0 && (
            <Section>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <Flame size={13} className="text-amber-500" />
                  <SectionHeader
                    title="Today's Priorities"
                    description={`Top ${priorities.length} material objectives to execute first`}
                  />
                </div>
                <span className="text-xs font-mono text-text-muted">
                  {priorities.length} {priorities.length === 1 ? "task" : "tasks"}
                </span>
              </div>

              <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden">
                {priorities.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onSelect={(t) => setSelectedTask(t)}
                    isPrioritySection
                  />
                ))}
              </div>
            </Section>
          )}

          {/* SECTION B: IN PROGRESS */}
          {(filterTab === "today" || filterTab === "incomplete" || filterTab === "all" || filterTab === "in_progress") &&
            inProgress.length > 0 && (
              <Section>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <PlayCircle size={13} className="text-emerald-500" />
                    <SectionHeader
                      title="In Progress"
                      description="Tasks currently being executed"
                    />
                  </div>
                  <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                    {inProgress.length} active
                  </span>
                </div>

                <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden">
                  {inProgress.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onSelect={(t) => setSelectedTask(t)}
                    />
                  ))}
                </div>
              </Section>
            )}

          {/* SECTION C: INCOMPLETE / UP NEXT */}
          {(filterTab === "today" || filterTab === "incomplete" || filterTab === "all") && upNext.length > 0 && (
            <Section>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <ListTodo size={13} className="text-text-muted" />
                  <SectionHeader
                    title={filterTab === "incomplete" ? "All Incomplete Tasks" : "Up Next & Backlog"}
                    description="Remaining action items and scheduled tasks"
                  />
                </div>
                <span className="text-xs font-mono text-text-muted">
                  {upNext.length} {upNext.length === 1 ? "task" : "tasks"}
                </span>
              </div>

              <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden">
                {upNext.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onSelect={(t) => setSelectedTask(t)}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* SECTION D: COMPLETED */}
          {(filterTab === "today" || filterTab === "all" || filterTab === "completed") &&
            completed.length > 0 && (
              <Section>
                <div
                  className="flex items-center justify-between mb-2.5 cursor-pointer select-none"
                  onClick={() => setShowCompleted(!showCompleted)}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={13} className="text-emerald-500" />
                    <SectionHeader
                      title="Completed"
                      description="Deliberate intentions achieved"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-text-muted">
                      {completed.length} done
                    </span>
                    <button
                      type="button"
                      className="text-xs text-text-muted hover:text-text-primary p-1 cursor-pointer"
                    >
                      {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </div>
                </div>

                {showCompleted && (
                  <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden">
                    {completed.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onSelect={(t) => setSelectedTask(t)}
                      />
                    ))}
                  </div>
                )}
              </Section>
            )}
        </div>
      )}

      {/* 7. Task Detail Drawer */}
      <TaskDetailDrawer
        task={activeSelectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </PageContainer>
  );
}
