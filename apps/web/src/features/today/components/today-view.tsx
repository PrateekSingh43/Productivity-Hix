"use client";

import React, { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Play,
  Pause,
  ArrowRight,
  Target,
  ListTodo,
  Edit3,
  Calendar,
  Check,
  Radio,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { PageContainer, PageHeader, Section, SectionHeader } from "@shared/components/layout";
import { DailyPlanView } from "./daily-plan-view";
import { EmptyState, PriorityBadge } from "@shared/components/primitives";
import { TaskDetailDrawer, ConfirmDiscardModal, useTasksList, createTask, updateTask } from "@features/tasks";
import {
  useActiveSession,
  createSession,
  finishSession,
  pauseSession,
  resumeSession,
  deleteSession,
} from "@features/sessions";
import { useTodayPlan } from "../api/queries";
import { useSavePlan, useUpdateGoalOutcome } from "../api/mutations";
import { useLiveTelemetry } from "@features/timeline";
import { useActivitySummary } from "@features/dashboard";
import { resolveProductiveDay, formatProductiveDateLabel, type Task } from "@repo/types";
import { useQueryClient } from "@tanstack/react-query";

export function TodayView() {
  const queryClient = useQueryClient();
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const hasNotifiedRef = useRef<string | null>(null);

  // Queries
  const planQuery = useTodayPlan();
  const tasksQuery = useTasksList();
  const activityQuery = useActivitySummary();
  const telemetry = useLiveTelemetry();

  // Mutations
  const savePlanMutation = useSavePlan();
  const updateOutcomeMutation = useUpdateGoalOutcome();

  // Focus Session execution state
  const [sessionActive, setSessionActive] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const activeSessionQuery = useActiveSession();
  const serverActiveSession = activeSessionQuery.data;

  // Quick Add Task state
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewNewTaskTitle] = useState("");
  const [newTaskDuration, setNewTaskDuration] = useState(30);
  const [newTaskGoalId, setNewTaskGoalId] = useState<string>("");
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>("");

  const plan = planQuery.data;
  const goals = plan?.goals ?? [];
  const independentTasks = plan?.independentTasks ?? [];

  // Date context
  const localTodayDate = resolveProductiveDay(new Date());
  const targetDate = plan?.date && plan.date >= localTodayDate ? plan.date : localTodayDate;
  const dateFormatted = formatProductiveDateLabel(targetDate);

  const rawTasks = tasksQuery.data ?? [];

  // Overdue / Missed tasks from previous days
  const overdueTasks = React.useMemo(() => {
    return rawTasks.filter((t) => {
      if (t.status === "done" || t.status === "cancelled") return false;
      // Active session or today's goal always surfaces in Today, not in overdue rollover prompt
      if (t.hasActiveSession) return false;
      if (goals.some((g) => g.id === t.goalId)) return false;
      // If task is scheduled for targetDate or later, it is handled in Today or future
      if (t.productiveDate && t.productiveDate >= targetDate) return false;

      if (t.dueAt) {
        const dueDateStr = format(new Date(t.dueAt), "yyyy-MM-dd");
        return dueDateStr < targetDate;
      }
      return Boolean(t.productiveDate && t.productiveDate < targetDate);
    });
  }, [rawTasks, targetDate, goals]);

  // Tasks belonging specifically to Today
  const tasks = React.useMemo(() => {
    const priorityWeight = { high: 3, medium: 2, low: 1, none: 0 };
    return rawTasks
      .filter((t) => {
        // Active session always surfaces in Today
        if (t.hasActiveSession) return true;
        // Belongs to one of today's goals
        if (goals.some((g) => g.id === t.goalId)) return true;
        // Specifically assigned to today's productive day
        if (t.productiveDate === targetDate) return true;
        // Due today
        if (t.dueAt) {
          const dueDateStr = format(new Date(t.dueAt), "yyyy-MM-dd");
          if (dueDateStr === targetDate) return true;
        }
        return false;
      })
      .sort((a, b) => {
        const pDiff = (priorityWeight[b.priority || "none"] || 0) - (priorityWeight[a.priority || "none"] || 0);
        if (pDiff !== 0) return pDiff;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [rawTasks, targetDate, goals]);

  // Handler to roll over overdue tasks to today
  const handleRollOverOverdue = async () => {
    for (const t of overdueTasks) {
      await updateTask(t.id, { productiveDate: targetDate });
    }
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["plans"] });
  };

  // Sync with server active session state (cross-synced with extension)
  useEffect(() => {
    if (serverActiveSession && !serverActiveSession.endedAt) {
      setSessionActive(true);
      setActiveSessionId(serverActiveSession.id);
      setIsPaused(Boolean(serverActiveSession.isPaused));

      if (serverActiveSession.taskId) {
        const found = rawTasks.find((t) => t.id === serverActiveSession.taskId);
        if (found) setSelectedTask(found);
      }

      if (serverActiveSession.isPaused) {
        setElapsedSeconds(serverActiveSession.durationSeconds ?? 0);
      } else {
        const segment = Math.max(
          0,
          Math.round((Date.now() - new Date(serverActiveSession.startedAt).getTime()) / 1000)
        );
        setElapsedSeconds((serverActiveSession.durationSeconds ?? 0) + segment);
      }
    } else if (serverActiveSession === null && sessionActive) {
      setSessionActive(false);
      setActiveSessionId(null);
      setSelectedTask(null);
      setElapsedSeconds(0);
      setIsPaused(false);
    }
  }, [serverActiveSession, rawTasks]);

  // Elapsed timer ticker (only ticks when active and not paused)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (sessionActive && !isPaused) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionActive, isPaused]);

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
    const s = Math.abs(seconds);
    const hours = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Trigger web notification when target is reached
  useEffect(() => {
    if (!sessionActive || isPaused) return;
    const targetMinutes = serverActiveSession?.targetDurationMinutes ?? selectedTask?.plannedDurationMinutes ?? 25;
    const targetSec = targetMinutes * 60;
    if (elapsedSeconds >= targetSec && activeSessionId && hasNotifiedRef.current !== activeSessionId) {
      hasNotifiedRef.current = activeSessionId;
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        const title = selectedTask?.title || "Focus Session";
        try {
          new Notification("Focus Target Reached!", {
            body: `Completed planned ${targetMinutes}m on "${title}". Continue in flow or wrap up & reflect.`,
            icon: "/icon.png",
          });
        } catch {}
      }
    }
  }, [sessionActive, isPaused, elapsedSeconds, activeSessionId, serverActiveSession, selectedTask]);

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
      const targetDurationMinutes = task.plannedDurationMinutes ?? 30;
      const session = await createSession({
        taskId: task.id,
        targetDurationMinutes,
        notes: `Focus on ${task.title}`,
        startedAt: new Date().toISOString(),
      });
      setActiveSessionId(session.id);
      setSessionActive(true);
      setIsPaused(false);
      setElapsedSeconds(0);
      await updateTask(task.id, { status: "in_progress" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch {
      setSessionActive(true);
    }
  };

  // Handler to pause focus
  const handlePauseFocus = async () => {
    if (!activeSessionId) return;
    setIsPaused(true);
    await pauseSession(activeSessionId);
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
  };

  // Handler to resume focus
  const handleResumeFocus = async () => {
    if (!activeSessionId) return;
    setIsPaused(false);
    await resumeSession(activeSessionId);
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
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
    setIsPaused(false);
    setElapsedSeconds(0);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    queryClient.invalidateQueries({ queryKey: ["plans"] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
  };

  // Handler to prompt discard focus session
  const handleDiscardFocus = () => {
    if (!activeSessionId) return;
    setShowDiscardModal(true);
  };

  const handleConfirmDiscard = async () => {
    if (!activeSessionId) return;
    try {
      await deleteSession(activeSessionId);
    } catch (e) {
      console.error("Failed to discard session:", e);
    }
    setShowDiscardModal(false);
    setSessionActive(false);
    setActiveSessionId(null);
    setSelectedTask(null);
    setIsPaused(false);
    setElapsedSeconds(0);
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
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

      {/* Overdue Tasks Alert Strip */}
      {overdueTasks.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-amber-500 shrink-0" />
            <span>
              You have <strong>{overdueTasks.length} incomplete {overdueTasks.length === 1 ? "task" : "tasks"}</strong> from previous days.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRollOverOverdue}
              className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 font-medium transition-colors cursor-pointer"
            >
              Reschedule all to Today
            </button>
            <Link
              href="/tasks"
              className="px-2.5 py-1 rounded border border-amber-500/30 hover:bg-amber-500/15 text-amber-800 dark:text-amber-200 font-medium transition-colors"
            >
              View in Tasks →
            </Link>
          </div>
        </div>
      )}

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
          <div className="rounded-xl border border-border-strong bg-bg-secondary p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-text-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-text-primary" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text-primary">
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
                    <Radio size={11} className="text-text-primary animate-pulse shrink-0" />
                    <span className="truncate">Observed: {telemetry.activeDomain || telemetry.activeApp}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
              <div className="text-right">
                <span className={`text-[11px] font-mono block ${
                  isPaused ? "text-amber-500" : (elapsedSeconds > ((serverActiveSession?.targetDurationMinutes ?? selectedTask?.plannedDurationMinutes ?? 25) * 60)) ? "text-amber-500 font-semibold" : "text-text-muted"
                }`}>
                  {isPaused
                    ? "Paused"
                    : elapsedSeconds > ((serverActiveSession?.targetDurationMinutes ?? selectedTask?.plannedDurationMinutes ?? 25) * 60)
                    ? "Overtime (Flow)"
                    : `Target ${serverActiveSession?.targetDurationMinutes ?? selectedTask?.plannedDurationMinutes ?? 25}m`}
                </span>
                <span className={`text-2xl font-semibold font-mono tabular-nums ${
                  isPaused
                    ? "text-amber-500"
                    : elapsedSeconds > ((serverActiveSession?.targetDurationMinutes ?? selectedTask?.plannedDurationMinutes ?? 25) * 60)
                    ? "text-amber-400"
                    : "text-text-primary"
                }`}>
                  {(() => {
                    const targetSec = (serverActiveSession?.targetDurationMinutes ?? selectedTask?.plannedDurationMinutes ?? 25) * 60;
                    const rem = targetSec - elapsedSeconds;
                    if (rem < 0) {
                      return `+${formatElapsed(Math.abs(rem))}`;
                    }
                    return formatElapsed(rem);
                  })()}
                </span>
              </div>

              {/* Pause / Resume Button */}
              {isPaused ? (
                <button
                  type="button"
                  onClick={handleResumeFocus}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 text-xs font-medium transition-colors cursor-pointer"
                  title="Resume focus session"
                >
                  <Play size={13} className="fill-current" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePauseFocus}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-bg-secondary border border-border-subtle hover:border-border-hover text-text-primary text-xs font-medium transition-colors cursor-pointer"
                  title="Pause focus session"
                >
                  <Pause size={13} />
                  <span>Pause</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleCompleteFocus}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-text-primary hover:opacity-90 text-bg-default text-xs font-medium transition-colors cursor-pointer"
              >
                <Check size={14} />
                <span>Complete</span>
              </button>

              <button
                type="button"
                onClick={handleDiscardFocus}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-md border border-border-subtle hover:border-red-500/40 hover:bg-red-500/10 text-xs font-medium text-text-muted hover:text-red-400 transition-colors cursor-pointer"
                title="Discard session"
              >
                <Trash2 size={13} />
                <span className="sr-only sm:not-sr-only sm:inline text-[11px]">Discard</span>
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
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-text-primary text-bg-default hover:opacity-90 px-3 py-1.5 rounded-md transition-opacity cursor-pointer shrink-0 shadow-xs"
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
                className="text-xs font-medium bg-text-primary text-bg-default px-3.5 py-1.5 rounded-md hover:opacity-90 cursor-pointer transition-opacity shadow-xs"
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
                              className="text-text-muted hover:text-text-primary transition-colors shrink-0 cursor-pointer"
                            >
                              {isDone ? (
                                <CheckCircle2 className="w-4 h-4 text-text-primary fill-text-primary/20" />
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
                            <div className={`flex items-center justify-end w-[60px] sm:w-[70px] ${isDone ? "opacity-60" : ""}`}>
                              {task.dueAt && (
                                <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-text-muted font-mono whitespace-nowrap">
                                  <Calendar size={11} />
                                  {format(new Date(task.dueAt), "MMM d")}
                                </span>
                              )}
                            </div>
                            <div className={`flex items-center justify-end w-[35px] sm:w-[45px] ${isDone ? "opacity-60" : ""}`}>
                              {task.plannedDurationMinutes && (
                                <span className="text-[11px] sm:text-xs font-mono text-text-muted">
                                  {task.plannedDurationMinutes}m
                                </span>
                              )}
                            </div>
                            <div className={`flex justify-end w-[55px] sm:w-[65px] ${isDone ? "opacity-60" : ""}`}>
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
                            <div className="flex justify-end w-[65px] sm:w-[75px]">
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
                              className="text-text-muted hover:text-text-primary transition-colors shrink-0 cursor-pointer"
                            >
                              {isDone ? (
                                <CheckCircle2 className="w-4 h-4 text-text-primary fill-text-primary/20" />
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
                            <div className={`flex items-center justify-end w-[60px] sm:w-[70px] ${isDone ? "opacity-60" : ""}`}>
                              {task.dueAt && (
                                <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-text-muted font-mono whitespace-nowrap">
                                  <Calendar size={11} />
                                  {format(new Date(task.dueAt), "MMM d")}
                                </span>
                              )}
                            </div>
                            <div className={`flex items-center justify-end w-[35px] sm:w-[45px] ${isDone ? "opacity-60" : ""}`}>
                              {task.plannedDurationMinutes && (
                                <span className="text-[11px] sm:text-xs font-mono text-text-muted">
                                  {task.plannedDurationMinutes}m
                                </span>
                              )}
                            </div>
                            <div className={`flex justify-end w-[55px] sm:w-[65px] ${isDone ? "opacity-60" : ""}`}>
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
                            <div className="flex justify-end w-[65px] sm:w-[75px]">
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
            <div className="text-xl sm:text-2xl font-semibold font-mono tabular-nums text-text-primary">
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
              <span className={`w-2 h-2 rounded-full ${telemetry.connected ? "bg-text-primary animate-pulse" : "bg-text-muted"}`} />
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

      <ConfirmDiscardModal
        isOpen={showDiscardModal}
        onConfirm={handleConfirmDiscard}
        onCancel={() => setShowDiscardModal(false)}
      />
    </PageContainer>
  );
}
