"use client";

import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Play,
  ArrowRight,
  Target,
  ListTodo,
  Edit3,
  Calendar,
  Check,
  Radio,
} from "lucide-react";
import Link from "next/link";
import { PageContainer } from "../../components/layout/page-container";
import { PageHeader } from "../../components/layout/page-header";
import { Section } from "../../components/layout/section";
import { SectionHeader } from "../../components/layout/section-header";
import { DailyPlanView } from "../../components/primitives/daily-plan-view";
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
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>("");

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

  // Initialize due date to today's productive date when targetDate is ready
  useEffect(() => {
    if (!newTaskDueDate && targetDate) {
      setNewTaskDueDate(targetDate);
    }
  }, [targetDate, newTaskDueDate]);

  const totalActiveMinutes = activityQuery.data?.activeTime
    ? Math.round(activityQuery.data.activeTime / 60)
    : 0;

  const sessionsCount = activityQuery.data?.sessions ?? 0;
  const tasksCompletedCount = tasks.filter((t) => t.status === "done").length;

  // Next actionable task (first incomplete task)
  const nextUpTask = tasks.find((t) => t.status !== "done");

  const formatElapsed = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Handler to toggle task done/todo
  const handleToggleTask = async (task: Task) => {
    const nextStatus = task.status === "done" ? "todo" : "done";
    await updateTask(task.id, { status: nextStatus });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["plans"] });
  };

  // Handler to start focus on a specific task
  const handleStartTaskFocus = async (task: Task) => {
    setSelectedTask(task);
    try {
      const session = await createSession({
        taskId: task.id,
        notes: `Focus on ${task.title}`,
        startedAt: new Date().toISOString(),
      });
      setActiveSessionId(session.id);
      setSessionActive(true);
      setElapsedSeconds(0);
      await updateTask(task.id, { status: "in_progress" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch {
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
      dueAt: newTaskDueDate ? new Date(`${newTaskDueDate}T23:59:59`).toISOString() : undefined,
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

      {/* 3. EXECUTION STRIP (Active Focus Session or Next Up Quick Focus) */}
      {sessionActive ? (
        <Section>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Focus Session Active
                  </span>
                  {selectedTask && (
                    <span className="text-xs text-text-muted">·</span>
                  )}
                  {selectedTask?.goalId && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-bg-secondary text-text-secondary border border-border-subtle truncate max-w-[180px]">
                      {goals.find((g) => g.id === selectedTask.goalId)?.title ?? "Goal"}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-semibold text-text-primary tracking-tight mt-0.5 truncate">
                  {selectedTask ? selectedTask.title : "Intentional Focus Block"}
                </h3>
                {(telemetry.activeDomain || telemetry.activeApp) && (
                  <div className="flex items-center gap-1.5 text-xs text-text-muted mt-1">
                    <Radio size={11} className="text-emerald-500 animate-pulse shrink-0" />
                    <span className="truncate">Observed: {telemetry.activeDomain || telemetry.activeApp}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
              <div className="text-right">
                <span className="text-[11px] font-mono text-text-muted block">
                  Elapsed
                </span>
                <span className="text-2xl font-semibold font-mono tabular-nums text-text-primary">
                  {formatElapsed(elapsedSeconds)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCompleteFocus}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors cursor-pointer"
              >
                <Check size={14} />
                <span>Complete Session</span>
              </button>
            </div>
          </div>
        </Section>
      ) : nextUpTask ? (
        <Section>
          <div className="rounded-xl border border-border-subtle bg-bg-secondary/40 px-5 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-medium text-text-muted shrink-0">
                Next Up
              </span>
              <span className="text-sm font-medium text-text-primary truncate">
                {nextUpTask.title}
              </span>
              {nextUpTask.plannedDurationMinutes && (
                <span className="text-xs text-text-muted font-mono shrink-0 hidden sm:inline">
                  ({nextUpTask.plannedDurationMinutes}m)
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleStartTaskFocus(nextUpTask)}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-text-primary text-bg-primary hover:opacity-90 px-3 py-1.5 rounded-md transition-opacity cursor-pointer shrink-0"
            >
              <Play size={11} className="fill-current" />
              <span>Start Focus</span>
            </button>
          </div>
        </Section>
      ) : null}

      {/* 4. TODAY'S TASKS (Unified list with hairline dividers, zero card-in-card) */}
      <Section id="tasks-section">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader
            title="Today's Tasks"
            description="Concrete action items supporting today's goals or independent tasks"
          />
          <button
            type="button"
            onClick={() => setIsAddingTask(!isAddingTask)}
            className="inline-flex items-center gap-1 text-xs font-medium text-text-primary hover:text-text-secondary bg-bg-secondary border border-border-subtle px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
          >
            <Plus size={13} />
            <span>Add Task</span>
          </button>
        </div>

        {/* Quick Add Task Inline Form */}
        {isAddingTask && (
          <form
            onSubmit={handleCreateTaskForToday}
            className="p-4 mb-4 rounded-xl border border-border-hover bg-bg-card space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                placeholder="What task needs to be done today?"
                value={newTaskTitle}
                onChange={(e) => setNewNewTaskTitle(e.target.value)}
                className="flex-1 text-sm bg-bg-secondary border border-border-subtle rounded-md px-3 py-2 text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:border-border-hover"
                autoFocus
              />
              <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                <select
                  value={newTaskGoalId}
                  onChange={(e) => setNewTaskGoalId(e.target.value)}
                  className="text-xs bg-bg-secondary border border-border-subtle rounded-md px-2.5 py-2 text-text-primary outline-none focus:border-border-hover cursor-pointer"
                >
                  <option value="">Independent Task (No Goal)</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      Goal: {g.title}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5 bg-bg-secondary border border-border-subtle rounded-md px-2.5 py-1.5">
                  <Calendar size={12} className="text-text-muted shrink-0" />
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="text-xs bg-transparent text-text-primary border-0 outline-none cursor-pointer"
                    title="Due date"
                  />
                </div>
                <div className="flex items-center gap-1 bg-bg-secondary border border-border-subtle rounded-md px-2 py-1.5">
                  <Clock size={12} className="text-text-muted shrink-0" />
                  <input
                    type="number"
                    min="5"
                    max="480"
                    step="5"
                    value={newTaskDuration}
                    onChange={(e) => setNewTaskDuration(parseInt(e.target.value, 10) || 30)}
                    className="w-10 text-xs bg-transparent text-text-primary border-0 outline-none font-mono"
                    title="Estimated duration in minutes"
                  />
                  <span className="text-[11px] text-text-muted">m</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setIsAddingTask(false)}
                className="text-xs text-text-muted hover:text-text-primary px-3 py-1.5 rounded-md hover:bg-bg-secondary cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="text-xs font-medium bg-text-primary text-bg-primary px-3.5 py-1.5 rounded-md hover:opacity-90 cursor-pointer transition-opacity"
              >
                Save Task
              </button>
            </div>
          </form>
        )}

        {/* Unified Task List with Hairline Dividers */}
        {tasks.length > 0 ? (
          <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden">
            {/* Goal-Grouped Tasks */}
            {goals.map((goal) => {
              const goalTasks = tasks.filter((t) => t.goalId === goal.id);
              if (goalTasks.length === 0) return null;

              return (
                <div key={goal.id}>
                  {/* Goal Subheader */}
                  <div className="flex items-center justify-between px-5 py-2.5 bg-bg-secondary/40 border-b border-border-subtle/50">
                    <div className="flex items-center gap-2">
                      <Target size={13} className="text-text-muted" />
                      <span className="text-xs font-semibold text-text-primary">
                        {goal.title}
                      </span>
                    </div>
                    <span className="text-xs text-text-muted font-mono">
                      {goalTasks.length} {goalTasks.length === 1 ? "task" : "tasks"}
                    </span>
                  </div>

                  {/* Tasks under this goal */}
                  <div className="divide-y divide-border-subtle/40">
                    {goalTasks.map((task) => {
                      const isDone = task.status === "done";
                      return (
                        <div
                          key={task.id}
                          className="group flex items-center justify-between px-5 py-3 hover:bg-bg-secondary/30 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => handleToggleTask(task)}
                              aria-label={isDone ? `Mark incomplete: ${task.title}` : `Mark complete: ${task.title}`}
                              className="text-text-muted hover:text-emerald-500 transition-colors shrink-0 cursor-pointer"
                            >
                              {isDone ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
                              ) : (
                                <Circle className="w-4 h-4" />
                              )}
                            </button>
                            <span
                              onClick={() => setEditingTask(task)}
                              className={`text-sm truncate cursor-pointer transition-colors ${
                                isDone
                                  ? "text-text-muted line-through opacity-70"
                                  : "text-text-primary hover:text-text-secondary"
                              }`}
                              title="Click to view details"
                            >
                              {task.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0 ml-3">
                            {task.dueAt && (
                              <span className={`inline-flex items-center gap-1 text-xs text-text-muted font-mono ${isDone ? "opacity-60" : ""}`}>
                                <Calendar size={11} />
                                {format(new Date(task.dueAt), "MMM d")}
                              </span>
                            )}
                            {task.plannedDurationMinutes && (
                              <span className={`text-xs font-mono text-text-muted ${isDone ? "opacity-60" : ""}`}>
                                {task.plannedDurationMinutes}m
                              </span>
                            )}
                            <div className={isDone ? "opacity-60" : ""}>
                              <PriorityBadge priority={task.priority} />
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingTask(task)}
                              className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-bg-secondary text-text-muted hover:text-text-primary rounded transition-all cursor-pointer"
                              title="Edit task"
                            >
                              <Edit3 size={13} />
                            </button>
                            {!sessionActive && !isDone && (
                              <button
                                type="button"
                                onClick={() => handleStartTaskFocus(task)}
                                className="inline-flex items-center gap-1 text-xs text-text-primary hover:text-text-secondary px-2.5 py-1 rounded bg-bg-secondary border border-border-subtle hover:border-border-hover cursor-pointer transition-colors"
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
                <div>
                  {/* Independent Subheader */}
                  <div className="flex items-center justify-between px-5 py-2.5 bg-bg-secondary/40 border-b border-border-subtle/50">
                    <div className="flex items-center gap-2">
                      <ListTodo size={13} className="text-text-muted" />
                      <span className="text-xs font-medium text-text-secondary">
                        Independent Tasks
                      </span>
                    </div>
                    <span className="text-xs text-text-muted font-mono">
                      {indep.length} {indep.length === 1 ? "task" : "tasks"}
                    </span>
                  </div>

                  {/* Tasks list */}
                  <div className="divide-y divide-border-subtle/40">
                    {indep.map((task) => {
                      const isDone = task.status === "done";
                      return (
                        <div
                          key={task.id}
                          className="group flex items-center justify-between px-5 py-3 hover:bg-bg-secondary/30 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => handleToggleTask(task)}
                              aria-label={isDone ? `Mark incomplete: ${task.title}` : `Mark complete: ${task.title}`}
                              className="text-text-muted hover:text-emerald-500 transition-colors shrink-0 cursor-pointer"
                            >
                              {isDone ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
                              ) : (
                                <Circle className="w-4 h-4" />
                              )}
                            </button>
                            <span
                              onClick={() => setEditingTask(task)}
                              className={`text-sm truncate cursor-pointer transition-colors ${
                                isDone
                                  ? "text-text-muted line-through opacity-70"
                                  : "text-text-primary hover:text-text-secondary"
                              }`}
                              title="Click to view details"
                            >
                              {task.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0 ml-3">
                            {task.dueAt && (
                              <span className={`inline-flex items-center gap-1 text-xs text-text-muted font-mono ${isDone ? "opacity-60" : ""}`}>
                                <Calendar size={11} />
                                {format(new Date(task.dueAt), "MMM d")}
                              </span>
                            )}
                            {task.plannedDurationMinutes && (
                              <span className={`text-xs font-mono text-text-muted ${isDone ? "opacity-60" : ""}`}>
                                {task.plannedDurationMinutes}m
                              </span>
                            )}
                            <div className={isDone ? "opacity-60" : ""}>
                              <PriorityBadge priority={task.priority} />
                            </div>
                            <button
                              type="button"
                              onClick={() => setEditingTask(task)}
                              className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-bg-secondary text-text-muted hover:text-text-primary rounded transition-all cursor-pointer"
                              title="Edit task"
                            >
                              <Edit3 size={13} />
                            </button>
                            {!sessionActive && !isDone && (
                              <button
                                type="button"
                                onClick={() => handleStartTaskFocus(task)}
                                className="inline-flex items-center gap-1 text-xs text-text-primary hover:text-text-secondary px-2.5 py-1 rounded bg-bg-secondary border border-border-subtle hover:border-border-hover cursor-pointer transition-colors"
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

      {/* 5. TODAY'S REALITY (Compact evidence summary ribbon) */}
      <Section>
        <div className="flex items-center justify-between mb-3">
          <SectionHeader
            title="Today's Reality"
            description="Intention vs Observation evidence summary"
          />
          <Link
            href="/timeline"
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <span>Inspect Timeline</span>
            <ArrowRight size={12} />
          </Link>
        </div>

        <div className="rounded-xl border border-border-subtle bg-bg-card grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border-subtle overflow-hidden">
          <div className="p-4 sm:p-5">
            <span className="text-xs text-text-muted block mb-1">
              Focus Sessions
            </span>
            <div className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-text-primary">
              {sessionsCount}
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Intentional sessions
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-xs text-text-muted block mb-1">
              Observed Activity
            </span>
            <div className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-text-primary">
              {totalActiveMinutes}m
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Desktop + Browser
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-xs text-text-muted block mb-1">
              Tasks Completed
            </span>
            <div className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {tasksCompletedCount}
              <span className="text-xs font-normal text-text-muted ml-1.5">
                / {tasks.length}
              </span>
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Completed today
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-xs text-text-muted block mb-1">
              Realtime Signal
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${telemetry.connected ? "bg-emerald-500 animate-pulse" : "bg-text-muted"}`} />
              <span className="text-sm font-semibold text-text-primary">
                {telemetry.connected ? "Telemetry Active" : "Waiting for Signal"}
              </span>
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Automatic capture
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
