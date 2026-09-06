"use client";

import { useState, useMemo } from "react";
import {
  Flame,
  PlayCircle,
  ListTodo,
  CheckCircle2,
  Filter,
  Layers,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Calendar,
} from "lucide-react";
import type { Task } from "@repo/types";
import { format } from "date-fns";
import { useTasksList, useSessionsList } from "../../src/hooks/queries/use-tasks";
import { ActiveSessionBanner } from "./active-session-banner";
import { TaskQuickAdd } from "./task-quick-add";
import { TaskItem } from "./task-item";
import { TaskDetailDrawer } from "./task-detail-drawer";

type FilterTab = "today" | "all" | "in_progress" | "completed";

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
  const { priorities, inProgress, upNext, completed } = useMemo(() => {
    const todoTasks = tasks.filter((t) => t.status === "todo" || t.status === "in_progress");
    const completedTasks = tasks.filter((t) => t.status === "done");

    // 1. TODAY'S PRIORITIES: High priority tasks (capped at 3-5 to maintain focus!)
    const highTasks = todoTasks.filter((t) => t.priority === "high");
    // If fewer than 3 high tasks, take the first few medium tasks to form top 3
    const topPriorities = highTasks.length >= 3
      ? highTasks.slice(0, 3)
      : [
          ...highTasks,
          ...todoTasks.filter((t) => t.priority !== "high").slice(0, 3 - highTasks.length),
        ];

    const priorityIds = new Set(topPriorities.map((t) => t.id));

    // 2. IN PROGRESS: Tasks with active sessions or in_progress status that aren't in priorities
    const inProg = todoTasks.filter(
      (t) => (t.hasActiveSession || t.status === "in_progress") && !priorityIds.has(t.id),
    );
    const inProgIds = new Set(inProg.map((t) => t.id));

    // 3. UP NEXT: Remaining todo tasks
    const next = todoTasks.filter(
      (t) => !priorityIds.has(t.id) && !inProgIds.has(t.id),
    );

    return {
      priorities: topPriorities,
      inProgress: inProg,
      upNext: next,
      completed: completedTasks,
    };
  }, [tasks]);

  return (
    <div className="w-full max-w-[1600px] mx-auto px-6 sm:px-8 py-8 space-y-6">
      {/* 1. Header & Workload Summary */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-[#f4f4f6] tracking-tight">Tasks</h1>
          <p className="text-sm text-[#8f96a8]">Your intentions for today</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-xs font-medium bg-[#111319] border border-[#232733] p-3 rounded-[var(--radius-md)]">
          <div className="flex items-center gap-2 text-[#f4f4f6]">
            <Calendar size={14} className="text-[#707df7]" />
            <span>{format(new Date(), "EEEE, MMMM d")}</span>
          </div>
          <div className="hidden sm:block text-[#2b3042]">|</div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[#8f96a8]">
              <span className="text-[#f4f4f6]">{formatHoursMinutes(plannedMinutes)}</span>
              <span>planned</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#8f96a8]">
              <span className="text-emerald-400">{formatHoursMinutes(actualMinutes)}</span>
              <span>actual</span>
            </div>
          </div>
        </div>

        {/* Overcommitment Warning */}
        {plannedMinutes > 360 && (
          <div className="flex items-start gap-3 p-3 rounded-[var(--radius-md)] bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs">
            <Flame size={14} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-400 mb-0.5">Your plan is heavy today</p>
              <p className="text-amber-500/80">
                {formatHoursMinutes(plannedMinutes)} planned. You may want to defer one task.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. Active Session Live Banner (if any session is active) */}
      <ActiveSessionBanner
        sessions={sessions}
        tasks={tasks}
        onSelectTask={(task) => setSelectedTask(task)}
      />

      {/* 3. Quick Add Task Bar */}
      <TaskQuickAdd />

      {/* 4. Filter Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-[#1f2330] pb-3 pt-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFilterTab("today")}
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors ${
              filterTab === "today"
                ? "bg-[#181a24] text-[#f4f4f6] border border-[#2b3042]"
                : "text-[#8f96a8] hover:text-[#f4f4f6]"
            }`}
          >
            Today's Focus
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors ${
              filterTab === "all"
                ? "bg-[#181a24] text-[#f4f4f6] border border-[#2b3042]"
                : "text-[#8f96a8] hover:text-[#f4f4f6]"
            }`}
          >
            All Tasks ({tasks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("in_progress")}
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors ${
              filterTab === "in_progress"
                ? "bg-[#181a24] text-[#f4f4f6] border border-[#2b3042]"
                : "text-[#8f96a8] hover:text-[#f4f4f6]"
            }`}
          >
            In Progress ({inProgress.length + (priorities.some((p) => p.hasActiveSession) ? 1 : 0)})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("completed")}
            className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors ${
              filterTab === "completed"
                ? "bg-[#181a24] text-[#f4f4f6] border border-[#2b3042]"
                : "text-[#8f96a8] hover:text-[#f4f4f6]"
            }`}
          >
            Completed ({completed.length})
          </button>
        </div>

        <span className="text-[11px] text-[#6b7280]">
          Click any task to inspect focus sessions & telemetry
        </span>
      </div>

      {/* 5. Main Task Sections */}
      {isLoadingTasks ? (
        <div className="p-12 text-center text-[#6b7280] text-sm">
          Loading tasks and focus records...
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[#262b3a] bg-[#0c0e14] p-12 text-center space-y-4">
          <h3 className="text-lg font-semibold text-[#f4f4f6]">TODAY</h3>
          <p className="text-sm text-[#8f96a8] max-w-sm mx-auto">
            No tasks yet.<br/><br/>
            What do you want to accomplish today?
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* SECTION A: TODAY'S PRIORITIES (Show if today or all) */}
          {(filterTab === "today" || filterTab === "all") && priorities.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
                    <Flame size={12} />
                  </div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#f4f4f6]">
                    Today's Priorities
                  </h3>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded">
                    Top {priorities.length}
                  </span>
                </div>
                <span className="text-[11px] text-[#6b7280]">
                  Focus strictly on these {priorities.length} items before taking on new work
                </span>
              </div>

              <div className="space-y-2">
                {priorities.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onSelect={(t) => setSelectedTask(t)}
                    isPrioritySection
                  />
                ))}
              </div>
            </div>
          )}

          {/* SECTION B: IN PROGRESS */}
          {(filterTab === "today" || filterTab === "all" || filterTab === "in_progress") &&
            inProgress.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                      <PlayCircle size={12} />
                    </div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#f4f4f6]">
                      In Progress
                    </h3>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded">
                      {inProgress.length}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {inProgress.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onSelect={(t) => setSelectedTask(t)}
                    />
                  ))}
                </div>
              </div>
            )}

          {/* SECTION C: UP NEXT */}
          {(filterTab === "today" || filterTab === "all") && upNext.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-[#1b1e2a] border border-[#2b3144] flex items-center justify-center text-[#8f96a8]">
                    <ListTodo size={12} />
                  </div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#8f96a8]">
                    Up Next
                  </h3>
                  <span className="text-[10px] font-mono text-[#8f96a8] bg-[#161822] border border-[#262b3a] px-1.5 py-0.5 rounded">
                    {upNext.length}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {upNext.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onSelect={(t) => setSelectedTask(t)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* SECTION D: COMPLETED */}
          {(filterTab === "today" || filterTab === "all" || filterTab === "completed") &&
            completed.length > 0 && (
              <div className="space-y-3 pt-2">
                <div
                  className="flex items-center justify-between cursor-pointer select-none"
                  onClick={() => setShowCompleted(!showCompleted)}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 size={12} />
                    </div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#6b7280] hover:text-[#8f96a8] transition-colors">
                      Completed ({completed.length})
                    </h3>
                  </div>

                  <button
                    type="button"
                    className="text-xs text-[#6b7280] hover:text-[#8f96a8] flex items-center gap-1"
                  >
                    {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>

                {showCompleted && (
                  <div className="space-y-2">
                    {completed.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onSelect={(t) => setSelectedTask(t)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
        </div>
      )}

      {/* 6. Task Detail Drawer */}
      <TaskDetailDrawer
        task={activeSelectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
}
