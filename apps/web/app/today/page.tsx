"use client";

import React, { useState, useEffect } from "react";
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
  ArrowRight,
  ExternalLink,
  Target,
  ListTodo,
  Edit3,
} from "lucide-react";
import Link from "next/link";
import { PageContainer } from "../../components/layout/page-container";
import { PageHeader } from "../../components/layout/page-header";
import { Section } from "../../components/layout/section";
import { SectionHeader } from "../../components/layout/section-header";
import { DailyPlanView } from "../../components/primitives/daily-plan-view";
import { CurrentFocusCard } from "../../components/primitives/current-focus-card";
import { EmptyState } from "../../components/primitives/empty-state";
import { PriorityBadge } from "../../components/primitives/data-badge";
import { TaskDetailDrawer } from "../../components/tasks/task-detail-drawer";
import { useTasks, useActivitySummary } from "../../src/hooks/queries/use-dashboard";
import {
  useTodayPlan,
  useSavePlan,
  useUpdateGoalOutcome,
} from "../../src/hooks/queries/use-plans";
import { useLiveTelemetry } from "../../src/hooks/use-live-telemetry";
import { createTask, updateTask } from "../../src/lib/api/tasks";
import { createSession, finishSession } from "../../src/lib/api/sessions";
import { resolveProductiveDay, formatProductiveDateLabel, type Task } from "@repo/types";
import { useQueryClient } from "@tanstack/react-query";

export default function TodayPage() {
  const queryClient = useQueryClient();

  // Queries
  const planQuery = useTodayPlan();
  const tasksQuery = useTasks();
  const activityQuery = useActivitySummary();
  const telemetry = useLiveTelemetry();

  // Mutations
  const savePlanMutation = useSavePlan();
  const updateOutcomeMutation = useUpdateGoalOutcome();

  // Focus Session execution state
  const [sessionActive, setSessionActive] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Quick Add Task state
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewNewTaskTitle] = useState("");
  const [newTaskDuration, setNewTaskDuration] = useState(30);
  const [newTaskGoalId, setNewTaskGoalId] = useState<string>("");

  const tasks = tasksQuery.data ?? [];
  const plan = planQuery.data;
  const goals = plan?.goals ?? [];
  const independentTasks = plan?.independentTasks ?? [];

  // Elapsed timer ticker
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (sessionActive) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionActive]);

  // Date context
  const targetDate = plan?.date || resolveProductiveDay();
  const dateFormatted = formatProductiveDateLabel(targetDate);

  const totalActiveMinutes = activityQuery.data?.activeTime
    ? Math.round(activityQuery.data.activeTime / 60)
    : 0;

  const sessionsCount = activityQuery.data?.sessions ?? 0;
  const tasksCompletedCount = tasks.filter((t) => t.status === "done").length;

  // Handler to toggle task done/todo
  const handleToggleTask = async (task: Task) => {
    const nextStatus = task.status === "done" ? "todo" : "done";
    await updateTask(task.id, { status: nextStatus });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["plans"] });
  };

  // Handler to start focus session
  const handleStartFocus = async () => {
    if (!selectedTask) return;
    try {
      const session = await createSession({
        taskId: selectedTask.id,
        notes: `Focus on ${selectedTask.title}`,
      });
      setActiveSessionId(session.id);
      setSessionActive(true);
      setElapsedSeconds(0);
      // mark task in progress
      await updateTask(selectedTask.id, { status: "in_progress" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch {
      // Fallback for visual continuity
      setSessionActive(true);
    }
  };

  // Handler to complete focus session
  const handleCompleteFocus = async () => {
    if (activeSessionId) {
      await finishSession(activeSessionId, "Completed intentional focus block");
    }
    if (selectedTask) {
      await updateTask(selectedTask.id, { status: "done" });
    }
    setSessionActive(false);
    setActiveSessionId(null);
    setSelectedTask(null);
    setElapsedSeconds(0);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    queryClient.invalidateQueries({ queryKey: ["plans"] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
  };

  // Quick Add Task for Today handler
  const handleCreateTaskForToday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const created = await createTask({
      title: newTaskTitle.trim(),
      plannedDurationMinutes: newTaskDuration,
      goalId: newTaskGoalId ? newTaskGoalId : null,
      productiveDate: targetDate,
    });

    setNewNewTaskTitle("");
    setIsAddingTask(false);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["plans"] });
    if (!selectedTask) {
      setSelectedTask(created);
    }
  };

  return (
    <PageContainer>
      {/* 1. Header with Productive Date Context */}
      <PageHeader
        title="Today"
        subtitle={dateFormatted}
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Today" },
        ]}
      />

      {/* 2. DAILY PLAN (0..N Goals, associated Tasks, independent Tasks) */}
      <Section>
        <DailyPlanView
          date={targetDate}
          hasPlan={plan?.hasPlan ?? false}
          goals={goals}
          independentTasks={independentTasks}
          isLoading={planQuery.isLoading}
          onSavePlan={async (updatedGoals) => {
            await savePlanMutation.mutateAsync({
              date: targetDate,
              goals: updatedGoals,
            });
          }}
          onAssessOutcome={async (goalId, outcome) => {
            await updateOutcomeMutation.mutateAsync({ goalId, outcome });
          }}
          onToggleTask={handleToggleTask}
        />
      </Section>

      {/* 3. CURRENT FOCUS / NOW (Active execution, selected task, contextual observed telemetry) */}
      <Section>
        <CurrentFocusCard
          isActive={sessionActive}
          selectedTask={selectedTask}
          availableTasks={tasks}
          elapsedSeconds={elapsedSeconds}
          observedApplication={telemetry.activeApp || undefined}
          observedDomain={telemetry.activeDomain || undefined}
          observedTitle={telemetry.windowTitle || undefined}
          onSelectTask={(task) => setSelectedTask(task)}
          onStartFocus={handleStartFocus}
          onPause={() => setSessionActive(false)}
          onResume={() => setSessionActive(true)}
          onComplete={handleCompleteFocus}
          onAddTask={() => setIsAddingTask(true)}
        />
      </Section>

      {/* 4. TODAY'S TASKS (Actionable task list grouped by Goal + Independent Tasks) */}
      <Section id="tasks-section">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader
            title="TODAY'S TASKS"
            description="Concrete action items supporting today's goals or independent tasks"
          />
          <button
            type="button"
            onClick={() => setIsAddingTask(!isAddingTask)}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
          >
            <Plus size={13} />
            <span>Add Task for Today</span>
          </button>
        </div>

        {/* Quick Add Task Inline Form */}
        {isAddingTask && (
          <form
            onSubmit={handleCreateTaskForToday}
            className="p-3 mb-4 rounded-lg border border-indigo-500/30 bg-[var(--background-card)] space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="What task needs to be done today?"
                value={newTaskTitle}
                onChange={(e) => setNewNewTaskTitle(e.target.value)}
                className="flex-1 text-xs sm:text-sm bg-[var(--background-subtle)] border border-[var(--border-subtle)] rounded-md px-3 py-2 text-[var(--foreground-primary)] placeholder:text-[var(--foreground-muted)] focus-visible:outline-none focus-visible:border-[var(--foreground-primary)]"
                autoFocus
              />
              <div className="flex gap-2">
                <select
                  value={newTaskGoalId}
                  onChange={(e) => setNewTaskGoalId(e.target.value)}
                  className="text-xs bg-[#141720] border border-[#262b3a] rounded-md px-2.5 py-1.5 text-[#f4f4f6] outline-none focus:border-[#707df7] [&>option]:bg-[#141720] [&>option]:text-[#f4f4f6] cursor-pointer"
                >
                  <option value="" style={{ backgroundColor: "#141720", color: "#f4f4f6" }}>
                    Independent Task (No Goal)
                  </option>
                  {goals.map((g) => (
                    <option
                      key={g.id}
                      value={g.id}
                      style={{ backgroundColor: "#141720", color: "#f4f4f6" }}
                    >
                      Goal: {g.title}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="5"
                  max="480"
                  step="5"
                  value={newTaskDuration}
                  onChange={(e) => setNewTaskDuration(parseInt(e.target.value, 10) || 30)}
                  className="w-16 text-xs bg-[var(--background-subtle)] border border-[var(--border-subtle)] rounded-md px-2 py-1.5 text-[var(--foreground-primary)]"
                  title="Estimated duration in minutes"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddingTask(false)}
                className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] px-3 py-1 rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="text-xs font-semibold bg-[var(--foreground-primary)] text-[var(--background-primary)] px-3 py-1 rounded hover:opacity-90 cursor-pointer"
              >
                Save Task
              </button>
            </div>
          </form>
        )}

        {/* Task List: Grouped by Goal + Independent */}
        {tasks.length > 0 ? (
          <div className="space-y-4">
            {/* Goal-Grouped Tasks */}
            {goals.map((goal) => {
              const goalTasks = tasks.filter((t) => t.goalId === goal.id);
              if (goalTasks.length === 0) return null;

              return (
                <div key={goal.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400">
                    <Target size={12} />
                    <span>Goal: {goal.title}</span>
                    <span className="text-[11px] text-[var(--foreground-muted)] font-normal">
                      ({goalTasks.length})
                    </span>
                  </div>

                  <div className="space-y-1.5 pl-2 border-l border-indigo-500/20">
                    {goalTasks.map((task) => {
                      const isDone = task.status === "done";
                      return (
                        <div
                          key={task.id}
                          className="group flex items-center justify-between p-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--background-card)] hover:border-[var(--border-hover)] transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => handleToggleTask(task)}
                              aria-label={isDone ? `Mark incomplete: ${task.title}` : `Mark complete: ${task.title}`}
                              className="text-[var(--foreground-muted)] hover:text-emerald-400 transition-colors shrink-0"
                            >
                              {isDone ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-500/20" />
                              ) : (
                                <Circle className="w-4 h-4" />
                              )}
                            </button>
                            <span
                              onClick={() => setEditingTask(task)}
                              className={`text-xs truncate cursor-pointer transition-colors ${
                                isDone
                                  ? "text-[#7e8597] opacity-75"
                                  : "text-[var(--foreground-primary)] hover:text-white"
                              }`}
                              title="Click to edit task"
                            >
                              {task.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {task.plannedDurationMinutes && (
                              <span className={`text-[11px] text-[var(--foreground-muted)] ${isDone ? "opacity-60" : ""}`}>
                                {task.plannedDurationMinutes}m
                              </span>
                            )}
                            <div className={isDone ? "opacity-60" : ""}>
                              <PriorityBadge priority={task.priority} />
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingTask(task)}
                              className="p-1 hover:bg-[var(--background-subtle)] text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] rounded transition-colors"
                              title="Edit task"
                            >
                              <Edit3 size={12} />
                            </button>
                            {!sessionActive && !isDone && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTask(task);
                                  setSessionActive(true);
                                }}
                                className="inline-flex items-center gap-1 text-[11px] text-[var(--foreground-primary)] hover:opacity-90 px-2 py-0.5 rounded bg-[var(--background-subtle)] border border-[var(--border-subtle)]"
                              >
                                <Play size={10} className="fill-current" />
                                <span>Focus</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Independent Tasks */}
            {(() => {
              const indep = tasks.filter((t) => !t.goalId);
              if (indep.length === 0) return null;

              return (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground-muted)]">
                    <ListTodo size={12} />
                    <span>Independent Tasks</span>
                    <span className="text-[11px] text-[var(--foreground-muted)] font-normal">
                      ({indep.length})
                    </span>
                  </div>

                  <div className="space-y-1.5 pl-2 border-l border-white/10">
                    {indep.map((task) => {
                      const isDone = task.status === "done";
                      return (
                        <div
                          key={task.id}
                          className="group flex items-center justify-between p-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--background-card)] hover:border-[var(--border-hover)] transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => handleToggleTask(task)}
                              aria-label={isDone ? `Mark incomplete: ${task.title}` : `Mark complete: ${task.title}`}
                              className="text-[var(--foreground-muted)] hover:text-emerald-400 transition-colors shrink-0"
                            >
                              {isDone ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-500/20" />
                              ) : (
                                <Circle className="w-4 h-4" />
                              )}
                            </button>
                            <span
                              onClick={() => setEditingTask(task)}
                              className={`text-xs truncate cursor-pointer transition-colors ${
                                isDone
                                  ? "text-[#7e8597] opacity-75"
                                  : "text-[var(--foreground-primary)] hover:text-white"
                              }`}
                              title="Click to edit task"
                            >
                              {task.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {task.plannedDurationMinutes && (
                              <span className={`text-[11px] text-[var(--foreground-muted)] ${isDone ? "opacity-60" : ""}`}>
                                {task.plannedDurationMinutes}m
                              </span>
                            )}
                            <div className={isDone ? "opacity-60" : ""}>
                              <PriorityBadge priority={task.priority} />
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingTask(task)}
                              className="p-1 hover:bg-[var(--background-subtle)] text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] rounded transition-colors"
                              title="Edit task"
                            >
                              <Edit3 size={12} />
                            </button>
                            {!sessionActive && !isDone && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTask(task);
                                  setSessionActive(true);
                                }}
                                className="inline-flex items-center gap-1 text-[11px] text-[var(--foreground-primary)] hover:opacity-90 px-2 py-0.5 rounded bg-[var(--background-subtle)] border border-[var(--border-subtle)]"
                              >
                                <Play size={10} className="fill-current" />
                                <span>Focus</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <EmptyState
            title="No Tasks for Today"
            description="Create tasks for today's work. They can support a Daily Goal or remain independent."
          />
        )}
      </Section>

      {/* 5. TODAY'S REALITY (Compact evidence summary — NO large React Flow graph) */}
      <Section>
        <div className="flex items-center justify-between mb-2">
          <SectionHeader
            title="TODAY'S REALITY"
            description="Compact evidence summary — Intention vs Observation"
          />
          <Link
            href="/timeline"
            className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
          >
            <span>Inspect Timeline</span>
            <ArrowRight size={12} />
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-4">
            <span className="text-xs text-[var(--foreground-muted)] block mb-1">
              Intentional sessions
            </span>
            <div className="text-xl font-bold font-mono text-[var(--foreground-primary)]">
              {sessionsCount > 0 ? `${sessionsCount} session${sessionsCount === 1 ? "" : "s"}` : "0"}
            </div>
            <p className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
              Completed focus sessions
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-4">
            <span className="text-xs text-[var(--foreground-muted)] block mb-1">
              Observed activity
            </span>
            <div className="text-xl font-bold font-mono text-[var(--foreground-primary)]">
              {totalActiveMinutes > 0 ? `${totalActiveMinutes}m` : "0m"}
            </div>
            <p className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
              Desktop + Browser telemetry
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-4">
            <span className="text-xs text-[var(--foreground-muted)] block mb-1">
              Tasks completed
            </span>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {tasksCompletedCount}
            </div>
            <p className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
              Out of {tasks.length} total tasks
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-4">
            <span className="text-xs text-[var(--foreground-muted)] block mb-1">
              Reflection status
            </span>
            <div className="text-sm font-semibold text-[var(--foreground-primary)] mt-1">
              {activityQuery.data?.activeTime ? "Telemetry active" : "Waiting for activity"}
            </div>
            <p className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
              Hourly reflections active
            </p>
          </div>
        </div>
      </Section>

      {/* 6. Task Detail Drawer for Editing on Today surface */}
      <TaskDetailDrawer
        task={editingTask}
        onClose={() => setEditingTask(null)}
      />
    </PageContainer>
  );
}
