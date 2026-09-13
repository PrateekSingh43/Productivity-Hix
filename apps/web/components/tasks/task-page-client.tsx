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
  History,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Target,
  Inbox,
  Sparkles,
} from "lucide-react";
import { resolveProductiveDay, type Task } from "@repo/types";
import { format } from "date-fns";
import { useTasksList, useSessionsList } from "../../src/hooks/queries/use-tasks";
import { useTodayPlan } from "../../src/hooks/queries/use-plans";
import { useUpdateTaskMutation } from "../../src/hooks/mutations/use-task-mutations";
import { ActiveSessionBanner } from "./active-session-banner";
import { TaskQuickAdd } from "./task-quick-add";
import { TaskItem } from "./task-item";
import { TaskDetailDrawer } from "./task-detail-drawer";
import { PageContainer } from "../layout/page-container";
import { PageHeader } from "../layout/page-header";
import { Section } from "../layout/section";
import { SectionHeader } from "../layout/section-header";

type FilterTab = "today" | "overdue" | "backlog" | "history";
type HistoryFilter = "all" | "completed" | "missed";

export function TaskPageClient() {
  const { data: tasks = [], isLoading: isLoadingTasks } = useTasksList();
  const { data: sessions = [] } = useSessionsList();
  const { data: todayPlan } = useTodayPlan();
  const updateTaskMutation = useUpdateTaskMutation();

  const [filterTab, setFilterTab] = useState<FilterTab>("today");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(true);

  // Date context
  const localTodayDate = resolveProductiveDay(new Date());
  const todayDate =
    todayPlan?.date && todayPlan.date >= localTodayDate ? todayPlan.date : localTodayDate;
  const todayGoalIds = useMemo(
    () => new Set((todayPlan?.goals ?? []).map((g) => g.id)),
    [todayPlan]
  );

  // Keep selectedTask in sync with fresh query data
  const activeSelectedTask = useMemo(() => {
    if (!selectedTask) return null;
    return tasks.find((t) => t.id === selectedTask.id) || selectedTask;
  }, [tasks, selectedTask]);

  // 1. Overdue / Missed tasks from previous days (strictly past deadlines, excluding items scheduled for today or later)
  const overdueTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.status === "done" || t.status === "cancelled") return false;
      // If the task has an active session, is linked to today's active goals, or is scheduled for today/future, it is NOT overdue!
      if (t.hasActiveSession) return false;
      if (t.productiveDate && t.productiveDate >= todayDate) return false;
      if (t.goalId && todayGoalIds.has(t.goalId)) return false;

      if (t.dueAt) {
        const dueDateStr = format(new Date(t.dueAt), "yyyy-MM-dd");
        return dueDateStr < todayDate;
      }
      return Boolean(t.productiveDate && t.productiveDate < todayDate);
    });
  }, [tasks, todayDate, todayGoalIds]);

  // 2. Tasks belonging specifically to Today
  const todayTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.hasActiveSession) return true;
      if (t.goalId && todayGoalIds.has(t.goalId)) return true;
      if (t.productiveDate === todayDate) return true;
      if (t.dueAt) {
        const dueDateStr = format(new Date(t.dueAt), "yyyy-MM-dd");
        if (dueDateStr === todayDate) return true;
      }
      return false;
    });
  }, [tasks, todayDate, todayGoalIds]);

  // Incomplete tasks for today
  const todayTodos = useMemo(() => {
    return todayTasks.filter((t) => t.status === "todo" || t.status === "in_progress");
  }, [todayTasks]);

  // Completed tasks for today
  const todayCompleted = useMemo(() => {
    return todayTasks.filter((t) => t.status === "done");
  }, [todayTasks]);

  // Today's Priorities: Top 3 high priority tasks of today
  const todayPriorities = useMemo(() => {
    const high = todayTodos.filter((t) => t.priority === "high");
    return high.length >= 3
      ? high.slice(0, 3)
      : [
          ...high,
          ...todayTodos.filter((t) => t.priority !== "high").slice(0, 3 - high.length),
        ];
  }, [todayTodos]);

  const todayPriorityIds = useMemo(
    () => new Set(todayPriorities.map((t) => t.id)),
    [todayPriorities]
  );

  // Today's Up Next: Remaining today's tasks
  const todayUpNext = useMemo(() => {
    return todayTodos.filter((t) => !todayPriorityIds.has(t.id));
  }, [todayTodos, todayPriorityIds]);

  // Today's In Progress tasks
  const todayInProgress = useMemo(() => {
    return todayTasks.filter((t) => t.hasActiveSession || t.status === "in_progress");
  }, [todayTasks]);

  // 3. Backlog tasks: Incomplete tasks not assigned to today or overdue (unscheduled or future scheduled)
  const backlogTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.status === "done" || t.status === "cancelled") return false;
      if (todayTasks.some((tt) => tt.id === t.id)) return false;
      if (overdueTasks.some((ot) => ot.id === t.id)) return false;
      return true;
    });
  }, [tasks, todayTasks, overdueTasks]);

  // Planned time for today's incomplete tasks
  const todayPlannedMinutes = useMemo(() => {
    return todayTodos.reduce((acc, t) => acc + (t.plannedDurationMinutes || 0), 0);
  }, [todayTodos]);

  // Actual time recorded for today's tasks
  const todayActualMinutes = useMemo(() => {
    const seconds = todayTasks.reduce((acc, t) => acc + (t.actualDurationSeconds || 0), 0);
    return Math.round(seconds / 60);
  }, [todayTasks]);

  // 4. History groups grouped chronologically by date (newest first)
  const historyGroups = useMemo(() => {
    const groupsMap = new Map<string, Task[]>();

    for (const t of tasks) {
      const d = t.productiveDate || (t.dueAt ? t.dueAt.slice(0, 10) : t.createdAt.slice(0, 10));
      const list = groupsMap.get(d) ?? [];
      list.push(t);
      groupsMap.set(d, list);
    }

    const sortedDates = Array.from(groupsMap.keys()).sort((a, b) => b.localeCompare(a));

    return sortedDates
      .map((dateStr) => {
        const rawList = groupsMap.get(dateStr) ?? [];
        const completedCount = rawList.filter((t) => t.status === "done").length;
        const totalCount = rawList.length;
        const totalSeconds = rawList.reduce((sum, t) => sum + (t.actualDurationSeconds ?? 0), 0);
        const actualMins = Math.round(totalSeconds / 60);

        const filteredList = rawList.filter((t) => {
          if (historyFilter === "completed") return t.status === "done";
          if (historyFilter === "missed") return t.status !== "done" && t.status !== "cancelled";
          return true;
        });

        let label = dateStr;
        try {
          if (dateStr === todayDate) {
            label = `Today · ${format(new Date(), "EEEE, MMM d")}`;
          } else {
            const parsed = new Date(`${dateStr}T12:00:00`);
            label = format(parsed, "EEEE, MMMM d, yyyy");
          }
        } catch {
          label = dateStr;
        }

        return {
          date: dateStr,
          label,
          isToday: dateStr === todayDate,
          isPast: dateStr < todayDate,
          tasks: filteredList,
          totalCount,
          completedCount,
          actualMins,
        };
      })
      .filter((g) => g.tasks.length > 0);
  }, [tasks, todayDate, historyFilter]);

  const historyTotalTasksCount = tasks.length;
  const historyCompletedTasksCount = tasks.filter((t) => t.status === "done").length;
  const historyMissedTasksCount = tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  ).length;

  const formatHoursMinutes = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  // Actions to reschedule overdue or backlog tasks to today
  const handleRescheduleToToday = (task: Task) => {
    updateTaskMutation.mutate({
      id: task.id,
      input: { productiveDate: todayDate },
    });
  };

  const handleRescheduleAllOverdue = async () => {
    for (const t of overdueTasks) {
      updateTaskMutation.mutate({
        id: t.id,
        input: { productiveDate: todayDate },
      });
    }
  };

  return (
    <PageContainer>
      {/* 1. Header & Context */}
      <PageHeader
        title="Tasks"
        subtitle="Deliberate intentions, priorities, history, and execution tracking"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Tasks" },
        ]}
      />

      {/* 2. Workload Ribbon (Context-aware based on active view) */}
      <div className="rounded-xl border border-border-subtle bg-bg-card grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border-subtle overflow-hidden">
        <div className="p-4">
          <span className="text-xs text-text-muted block mb-1">
            {filterTab === "history" ? "Active Cycle" : "Today"}
          </span>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <Calendar size={13} className="text-text-muted shrink-0" />
            <span className="truncate" suppressHydrationWarning>{format(new Date(), "EEEE, MMM d")}</span>
          </div>
        </div>

        <div className="p-4">
          <span className="text-xs text-text-muted block mb-1">
            {filterTab === "history"
              ? "Total Tasks Logged"
              : filterTab === "backlog"
              ? "Backlog Workload"
              : "Planned for Today"}
          </span>
          <div className="text-lg font-semibold font-mono tabular-nums text-text-primary">
            {filterTab === "history"
              ? `${historyTotalTasksCount} tasks`
              : filterTab === "backlog"
              ? `${backlogTasks.length} tasks`
              : formatHoursMinutes(todayPlannedMinutes)}
          </div>
        </div>

        <div className="p-4">
          <span className="text-xs text-text-muted block mb-1">
            {filterTab === "history" ? "All-Time Completed" : "Actual Focus Today"}
          </span>
          <div className="text-lg font-semibold font-mono tabular-nums text-text-primary">
            {filterTab === "history"
              ? `${historyCompletedTasksCount} (${historyTotalTasksCount > 0 ? Math.round((historyCompletedTasksCount / historyTotalTasksCount) * 100) : 0}%)`
              : formatHoursMinutes(todayActualMinutes)}
          </div>
        </div>

        <div className="p-4">
          <span className="text-xs text-text-muted block mb-1">
            {filterTab === "overdue"
              ? "Overdue from Past"
              : filterTab === "backlog"
              ? "Unscheduled / Future"
              : filterTab === "history"
              ? "Missed / Incomplete"
              : "Incomplete Today"}
          </span>
          <div
            className={`text-lg font-semibold font-mono tabular-nums ${
              overdueTasks.length > 0 && filterTab === "overdue"
                ? "text-rose-600 dark:text-rose-400"
                : "text-text-primary"
            }`}
          >
            {filterTab === "overdue"
              ? overdueTasks.length
              : filterTab === "backlog"
              ? backlogTasks.length
              : filterTab === "history"
              ? historyMissedTasksCount
              : todayTodos.length}
          </div>
        </div>
      </div>

      {/* Heavy Workload Warning */}
      {todayPlannedMinutes > 360 && filterTab === "today" && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
          <Flame size={14} className="shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="font-semibold text-amber-600 dark:text-amber-400 mb-0.5">
              Heavy planned workload today
            </p>
            <p className="text-amber-700/80 dark:text-amber-300/80">
              {formatHoursMinutes(todayPlannedMinutes)} planned. Guidance recommends focusing on 1–3
              material priorities.
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

      {/* 5. The 4 Non-Overlapping Views Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="bg-bg-secondary p-1 rounded-lg border border-border-subtle inline-flex items-center gap-1 overflow-x-auto max-w-full">
          {/* VIEW 1: TODAY */}
          <button
            type="button"
            onClick={() => setFilterTab("today")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterTab === "today"
                ? "bg-bg-card text-text-primary border border-border-subtle/60 shadow-2xs font-semibold"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            <Sparkles size={13} className={filterTab === "today" ? "text-amber-500" : "text-text-muted"} />
            <span>Today</span>
            <span className="text-[11px] font-mono opacity-80">({todayTodos.length})</span>
          </button>

          {/* VIEW 2: OVERDUE */}
          <button
            type="button"
            onClick={() => setFilterTab("overdue")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterTab === "overdue"
                ? "bg-bg-card text-text-primary border border-border-subtle/60 shadow-2xs font-semibold"
                : overdueTasks.length > 0
                ? "text-amber-600 dark:text-amber-400 hover:text-amber-700 font-semibold"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            <Clock size={13} className={overdueTasks.length > 0 ? "text-amber-500" : "text-text-muted"} />
            <span>Overdue</span>
            <span
              className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                overdueTasks.length > 0
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold"
                  : "opacity-80"
              }`}
            >
              {overdueTasks.length}
            </span>
          </button>

          {/* VIEW 3: BACKLOG */}
          <button
            type="button"
            onClick={() => setFilterTab("backlog")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterTab === "backlog"
                ? "bg-bg-card text-text-primary border border-border-subtle/60 shadow-2xs font-semibold"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            <Inbox size={13} className="shrink-0" />
            <span>Backlog</span>
            <span className="text-[11px] font-mono opacity-80">({backlogTasks.length})</span>
          </button>

          {/* VIEW 4: HISTORY / LOGBOOK */}
          <button
            type="button"
            onClick={() => setFilterTab("history")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              filterTab === "history"
                ? "bg-bg-card text-text-primary border border-border-subtle/60 shadow-2xs font-semibold"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            <History size={13} className="shrink-0" />
            <span>History</span>
          </button>
        </div>

        <span className="text-xs text-text-muted">
          Click any task to inspect details & focus sessions
        </span>
      </div>

      {/* 6. Main Task Views */}
      {isLoadingTasks ? (
        <div className="rounded-xl border border-border-subtle bg-bg-card p-12 text-center text-text-muted text-sm animate-pulse">
          Loading tasks and focus records...
        </div>
      ) : (
        <div className="space-y-6">
          {/* ========================================================= */}
          {/* VIEW 1: TODAY'S FOCUS */}
          {/* ========================================================= */}
          {filterTab === "today" && (
            <>
              {/* Overdue alert banner */}
              {overdueTasks.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-amber-500 shrink-0" />
                    <span>
                      You have <strong>{overdueTasks.length} incomplete {overdueTasks.length === 1 ? "task" : "tasks"}</strong> from previous days.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleRescheduleAllOverdue}
                      className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 font-medium transition-colors cursor-pointer"
                    >
                      Reschedule all to Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterTab("overdue")}
                      className="px-2.5 py-1 rounded border border-amber-500/30 hover:bg-amber-500/15 text-amber-800 dark:text-amber-200 font-medium transition-colors cursor-pointer"
                    >
                      View Overdue ({overdueTasks.length}) →
                    </button>
                  </div>
                </div>
              )}

              {todayTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-subtle bg-bg-card p-12 text-center space-y-3">
                  <h3 className="text-base font-semibold text-text-primary">No tasks planned for today</h3>
                  <p className="text-xs sm:text-sm text-text-muted max-w-sm mx-auto">
                    Use the quick add bar above to plan today&apos;s intentions, or pull items from your Backlog or Overdue queues.
                  </p>
                  {overdueTasks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterTab("overdue")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-bg-secondary border border-border-subtle hover:border-border-hover text-xs font-medium text-text-primary transition-colors cursor-pointer"
                    >
                      <Clock size={12} className="text-amber-500" />
                      <span>Review {overdueTasks.length} Overdue Tasks</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Today's Priorities */}
                  {todayPriorities.length > 0 && (
                    <Section>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <Flame size={13} className="text-amber-500" />
                          <SectionHeader
                            title="Today's Priorities"
                            description={`Top ${todayPriorities.length} material objectives for today`}
                          />
                        </div>
                        <span className="text-xs font-mono text-text-muted">
                          {todayPriorities.length} {todayPriorities.length === 1 ? "task" : "tasks"}
                        </span>
                      </div>

                      <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden">
                        {todayPriorities.map((task) => (
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

                  {/* Today's In Progress */}
                  {todayInProgress.length > 0 && (
                    <Section>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <PlayCircle size={13} className="text-text-primary" />
                          <SectionHeader
                            title="In Progress"
                            description="Tasks currently being executed today"
                          />
                        </div>
                        <span className="text-xs font-mono text-text-primary">
                          {todayInProgress.length} active
                        </span>
                      </div>

                      <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden">
                        {todayInProgress.map((task) => (
                          <TaskItem
                            key={task.id}
                            task={task}
                            onSelect={(t) => setSelectedTask(t)}
                          />
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Today's Up Next */}
                  {todayUpNext.length > 0 && (
                    <Section>
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <ListTodo size={13} className="text-text-muted" />
                          <SectionHeader
                            title="Up Next Today"
                            description="Remaining planned action items for today"
                          />
                        </div>
                        <span className="text-xs font-mono text-text-muted">
                          {todayUpNext.length} {todayUpNext.length === 1 ? "task" : "tasks"}
                        </span>
                      </div>

                      <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden">
                        {todayUpNext.map((task) => (
                          <TaskItem
                            key={task.id}
                            task={task}
                            onSelect={(t) => setSelectedTask(t)}
                          />
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Today's Completed */}
                  {todayCompleted.length > 0 && (
                    <Section>
                      <div
                        className="flex items-center justify-between mb-2.5 cursor-pointer select-none"
                        onClick={() => setShowCompleted(!showCompleted)}
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={13} className="text-text-primary" />
                          <SectionHeader
                            title="Completed Today"
                            description="Deliberate intentions achieved today"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-text-muted">
                            {todayCompleted.length} done
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
                          {todayCompleted.map((task) => (
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
            </>
          )}

          {/* ========================================================= */}
          {/* VIEW 2: OVERDUE */}
          {/* ========================================================= */}
          {filterTab === "overdue" && (
            <Section>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <Clock size={15} className="text-amber-500" />
                    <span>Overdue & Missed Tasks</span>
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Incomplete tasks from previous days. They do not pollute Today unless you reschedule them.
                  </p>
                </div>

                {overdueTasks.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRescheduleAllOverdue}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-secondary border border-border-subtle hover:border-border-hover text-xs font-medium text-text-primary transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    <Calendar size={13} />
                    <span>Reschedule All to Today</span>
                  </button>
                )}
              </div>

              {overdueTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-subtle bg-bg-card p-12 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
                    <CheckCircle2 size={20} />
                  </div>
                  <h3 className="text-base font-semibold text-text-primary">No overdue tasks</h3>
                  <p className="text-xs sm:text-sm text-text-muted max-w-sm mx-auto">
                    All previous tasks have been completed or rescheduled. You are completely caught up!
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden">
                  {overdueTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onSelect={(t) => setSelectedTask(t)}
                      onRescheduleToday={handleRescheduleToToday}
                    />
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ========================================================= */}
          {/* VIEW 3: BACKLOG & UNSCHEDULED */}
          {/* ========================================================= */}
          {filterTab === "backlog" && (
            <Section>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <Inbox size={15} className="text-text-primary" />
                    <span>Backlog & Unscheduled Tasks</span>
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Ideas, upcoming projects, and tasks waiting for an intentional scheduled day
                  </p>
                </div>

                <span className="text-xs font-mono text-text-muted shrink-0 self-start sm:self-auto">
                  {backlogTasks.length} {backlogTasks.length === 1 ? "task" : "tasks"}
                </span>
              </div>

              {backlogTasks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-subtle bg-bg-card p-12 text-center space-y-2">
                  <h3 className="text-base font-semibold text-text-primary">Backlog is empty</h3>
                  <p className="text-xs sm:text-sm text-text-muted max-w-sm mx-auto">
                    All active tasks are currently scheduled for today or completed. Use Quick Add above to add future intentions.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-border-subtle bg-bg-card divide-y divide-border-subtle overflow-hidden">
                  {backlogTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onSelect={(t) => setSelectedTask(t)}
                      onRescheduleToday={handleRescheduleToToday}
                    />
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ========================================================= */}
          {/* VIEW 4: HISTORY / LOGBOOK */}
          {/* ========================================================= */}
          {filterTab === "history" && (
            <Section>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <History size={15} className="text-text-primary" />
                    <span>Task History & Daily Logbook</span>
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Chronological daily records of intentions, completions, and missed tasks
                  </p>
                </div>

                {/* Sub-filter pills */}
                <div className="flex items-center gap-1 bg-bg-secondary p-1 rounded-lg border border-border-subtle self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setHistoryFilter("all")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                      historyFilter === "all"
                        ? "bg-bg-card text-text-primary shadow-2xs"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    All ({historyTotalTasksCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter("completed")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                      historyFilter === "completed"
                        ? "bg-bg-card text-text-primary shadow-2xs"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Completed ({historyCompletedTasksCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter("missed")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                      historyFilter === "missed"
                        ? "bg-bg-card text-text-primary shadow-2xs"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    Missed ({historyMissedTasksCount})
                  </button>
                </div>
              </div>

              {historyGroups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-subtle bg-bg-card p-12 text-center space-y-2">
                  <h3 className="text-base font-semibold text-text-primary">No history records found</h3>
                  <p className="text-xs sm:text-sm text-text-muted max-w-sm mx-auto">
                    {historyFilter !== "all"
                      ? `No ${historyFilter} tasks found in your history.`
                      : "Create and execute tasks to populate your daily logbook."}
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {historyGroups.map((group) => {
                    const completionRate =
                      group.totalCount > 0
                        ? Math.round((group.completedCount / group.totalCount) * 100)
                        : 0;

                    return (
                      <div
                        key={group.date}
                        className="rounded-xl border border-border-subtle bg-bg-card overflow-hidden shadow-2xs"
                      >
                        {/* Day Group Header */}
                        <div className="px-5 py-3 bg-bg-secondary/40 border-b border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Calendar size={13} className="text-text-muted shrink-0" />
                            <span className="text-xs font-semibold text-text-primary" suppressHydrationWarning>
                              {group.label}
                            </span>
                            {group.isToday && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-text-primary text-bg-default uppercase tracking-wider">
                                Current
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs">
                            {group.actualMins > 0 && (
                              <span className="text-text-muted font-mono flex items-center gap-1">
                                <Clock size={11} />
                                {formatHoursMinutes(group.actualMins)} recorded
                              </span>
                            )}
                            <span
                              className={`font-mono text-xs px-2 py-0.5 rounded border ${
                                completionRate === 100
                                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                  : completionRate > 0
                                  ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                                  : "bg-bg-secondary border-border-subtle text-text-muted"
                              }`}
                            >
                              {group.completedCount} / {group.totalCount} completed ({completionRate}%)
                            </span>
                          </div>
                        </div>

                        {/* Day Tasks List */}
                        <div className="divide-y divide-border-subtle">
                          {group.tasks.map((task) => (
                            <TaskItem
                              key={task.id}
                              task={task}
                              onSelect={(t) => setSelectedTask(t)}
                              onRescheduleToday={
                                group.isPast ? handleRescheduleToToday : undefined
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
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
