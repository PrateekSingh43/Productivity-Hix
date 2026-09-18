"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  X,
  CheckCircle2,
  Circle,
  Play,
  Pause,
  Square,
  Clock,
  Calendar,
  Layers,
  Activity,
  ArrowRight,
  Trash2,
  FileText,
  Target,
  History,
  AlertTriangle,
  RotateCcw,
  MessageSquare,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { resolveProductiveDay, type Task, type TaskPriority, type TaskStatus } from "@repo/types";
import { useTaskDetail, useTaskActivity } from "../api/queries";
import { useTodayPlan } from "@features/today";
import { useUpdateTaskMutation, useDeleteTaskMutation } from "../api/mutations";
import {
  useStartTaskSessionMutation,
  useEndTaskSessionMutation,
  useDeleteSessionMutation,
  usePauseSessionMutation,
  useResumeSessionMutation,
} from "@features/sessions";
import { FocusReflectionModal } from "./focus-reflection-modal";

interface TaskDetailDrawerProps {
  task: Task | null;
  onClose: () => void;
}

const PRIORITIES: Array<{ label: string; value: TaskPriority }> = [
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
  { label: "None", value: "none" },
];

const STATUSES: Array<{ label: string; value: TaskStatus }> = [
  { label: "To Do", value: "todo" },
  { label: "In Progress", value: "in_progress" },
  { label: "Done", value: "done" },
  { label: "Cancelled", value: "cancelled" },
];

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180];

function CheckmarkIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function TaskDetailDrawer({ task, onClose }: TaskDetailDrawerProps) {
  const taskId = task?.id ?? null;
  const { data: taskDetail } = useTaskDetail(taskId);
  const { data: activitySummary = [] } = useTaskActivity(taskId);
  const todayPlan = useTodayPlan();
  const goals = todayPlan.data?.goals ?? [];

  const updateTaskMutation = useUpdateTaskMutation();
  const deleteTaskMutation = useDeleteTaskMutation();
  const startSessionMutation = useStartTaskSessionMutation();
  const endSessionMutation = useEndTaskSessionMutation();
  const pauseSessionMutation = usePauseSessionMutation();
  const resumeSessionMutation = useResumeSessionMutation();
  const deleteSessionMutation = useDeleteSessionMutation();

  const [reflectionSession, setReflectionSession] = useState<{
    id: string;
    taskId?: string | null;
    taskTitle?: string | null;
    durationSeconds?: number | null;
  } | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [plannedDuration, setPlannedDuration] = useState<number>(30);
  const [goalId, setGoalId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [lastLoadedId, setLastLoadedId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [baseline, setBaseline] = useState({
    title: "",
    description: "",
    priority: "medium" as TaskPriority,
    status: "todo" as TaskStatus,
    plannedDuration: 30,
    goalId: "",
    dueDate: "",
  });

  // Sync state ONLY when opening or switching to a different task
  useEffect(() => {
    if (!task) {
      setLastLoadedId(null);
      setIsSaved(false);
      return;
    }
    if (task.id !== lastLoadedId) {
      const parsedDueDate = task.dueAt
        ? format(new Date(task.dueAt), "yyyy-MM-dd")
        : "";
      const initial = {
        title: task.title || "",
        description: task.description || "",
        priority: task.priority || "medium",
        status: task.status || "todo",
        plannedDuration: task.plannedDurationMinutes || 30,
        goalId: task.goalId || "",
        dueDate: parsedDueDate,
      };
      setTitle(initial.title);
      setDescription(initial.description);
      setPriority(initial.priority);
      setStatus(initial.status);
      setPlannedDuration(initial.plannedDuration);
      setGoalId(initial.goalId);
      setDueDate(initial.dueDate);
      setBaseline(initial);
      setLastLoadedId(task.id);
      setIsSaved(false);
    }
  }, [task, lastLoadedId]);

  // If taskDetail arrives with richer description (e.g. if initial task object had none)
  useEffect(() => {
    if (taskDetail && taskDetail.id === lastLoadedId && !description && taskDetail.description) {
      setDescription(taskDetail.description);
      setBaseline((prev) => ({ ...prev, description: taskDetail.description || "" }));
    }
  }, [taskDetail, lastLoadedId, description]);

  if (!task) return null;

  const currentTask = taskDetail || task;
  const isDone = status === "done";
  const actualSeconds = currentTask.actualDurationSeconds || 0;
  const actualMinutes = Math.round(actualSeconds / 60);

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const varianceMinutes = actualMinutes - plannedDuration;

  const sessions = taskDetail?.sessions || [];
  const activeSession = sessions.find((s) => !s.endedAt);
  const checkIns = taskDetail?.checkIns || [];

  const localToday = resolveProductiveDay(new Date());
  const createdDate = currentTask.createdAt
    ? format(new Date(currentTask.createdAt), "MMM d, yyyy")
    : "Unknown";
  const createdDaysAgo = currentTask.createdAt
    ? Math.max(
        0,
        Math.floor((new Date().getTime() - new Date(currentTask.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      )
    : 0;

  const dueDateStr = currentTask.dueAt ? format(new Date(currentTask.dueAt), "yyyy-MM-dd") : null;
  const isPastDue = Boolean(
    dueDateStr && dueDateStr < localToday && currentTask.status !== "done" && currentTask.status !== "cancelled"
  );
  const isScheduledToday = currentTask.productiveDate === localToday;
  const isRolloverToToday = isPastDue && isScheduledToday;
  const isOverdue = isPastDue && !isScheduledToday && !activeSession;

  let daysOverdue = 0;
  if (dueDateStr && isPastDue) {
    const dueTime = new Date(dueDateStr).getTime();
    const todayTime = new Date(localToday).getTime();
    daysOverdue = Math.max(1, Math.round((todayTime - dueTime) / (1000 * 60 * 60 * 24)));
  }

  const handleScheduleToToday = () => {
    updateTaskMutation.mutate({
      id: currentTask.id,
      input: {
        productiveDate: localToday,
      },
    });
  };

  // Check if draft has unsaved changes compared to baseline
  const isDirty =
    title.trim() !== baseline.title.trim() ||
    description.trim() !== baseline.description.trim() ||
    status !== baseline.status ||
    priority !== baseline.priority ||
    plannedDuration !== baseline.plannedDuration ||
    (goalId || "") !== (baseline.goalId || "") ||
    (dueDate || "") !== (baseline.dueDate || "");

  const handleSaveAll = () => {
    if (!title.trim()) return;
    const saveTitle = title.trim();
    const saveDesc = description.trim() || null;
    const saveGoalId = goalId ? goalId : null;
    const savePlannedDuration = plannedDuration;
    const saveStatus = status;
    const savePriority = priority;
    const saveDueAt = dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null;

    updateTaskMutation.mutate(
      {
        id: currentTask.id,
        input: {
          title: saveTitle,
          description: saveDesc,
          status: saveStatus,
          priority: savePriority,
          plannedDurationMinutes: savePlannedDuration,
          goalId: saveGoalId,
          dueAt: saveDueAt,
        },
      },
      {
        onSuccess: () => {
          setBaseline({
            title: saveTitle,
            description: saveDesc || "",
            status: saveStatus,
            priority: savePriority,
            plannedDuration: savePlannedDuration,
            goalId: saveGoalId || "",
            dueDate: dueDate || "",
          });
          setIsSaved(true);
          onClose(); // Close the drawer immediately after saving
        },
      },
    );
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this task?")) {
      deleteTaskMutation.mutate(currentTask.id, {
        onSuccess: () => onClose(),
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Surface 2 Drawer Body */}
      <div className="relative w-full max-w-xl bg-bg-card border-l border-border-subtle shadow-2xl h-full flex flex-col z-10 animate-in slide-in-from-right duration-200 text-text-primary">
        {/* Header Bar */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3 bg-bg-card">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mark Done Checkbox */}
            <button
              type="button"
              onClick={() => setStatus(status === "done" ? "todo" : "done")}
              className={`shrink-0 transition-transform active:scale-95 cursor-pointer ${
                isDone ? "text-text-primary hover:text-text-primary" : "text-text-muted hover:text-text-primary"
              }`}
              title={isDone ? "Mark incomplete" : "Mark done"}
            >
              {isDone ? (
                <CheckCircle2 size={20} className="fill-text-primary/20" />
              ) : (
                <Circle size={20} />
              )}
            </button>

            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary font-mono">
              Task Details
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Save Button */}
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={!title.trim() || updateTaskMutation.isPending || !isDirty}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                isDirty
                  ? "bg-text-primary text-bg-default hover:opacity-90 shadow-xs"
                  : "bg-bg-secondary text-text-muted border border-border-subtle cursor-not-allowed opacity-50"
              }`}
              title="Save task changes"
            >
              <CheckmarkIcon size={13} />
              <span>{updateTaskMutation.isPending ? "Saving..." : isSaved ? "Saved!" : "Save"}</span>
            </button>

            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 rounded-md text-text-muted hover:text-rose-500 hover:bg-bg-secondary transition-colors cursor-pointer"
              title="Delete task"
            >
              <Trash2 size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Title Editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-text-secondary">
                Title
              </label>
              {isDirty && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">● Unsaved changes</span>
              )}
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveAll()}
              placeholder="Task title..."
              className="w-full bg-bg-secondary border border-border-subtle focus:border-border-hover rounded-lg p-2.5 text-sm sm:text-base font-semibold text-text-primary outline-none transition-colors"
            />
          </div>

          {/* Lifecycle & Schedule Status Banner */}
          {isOverdue && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-rose-600 dark:text-rose-400">
                    Overdue by {daysOverdue} {daysOverdue === 1 ? "day" : "days"} (Due {dueDateStr ? format(new Date(currentTask.dueAt!), "MMM d") : ""})
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5 truncate">
                    Reschedule to Today to align with today&apos;s execution plan.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleScheduleToToday}
                disabled={updateTaskMutation.isPending}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 transition-colors shrink-0 cursor-pointer"
                title="Reschedule to Today"
              >
                <RotateCcw size={12} />
                <span>To Today</span>
              </button>
            </div>
          )}

          {isRolloverToToday && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <RotateCcw size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-amber-600 dark:text-amber-400">
                    Rollover Task • Scheduled for Today
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5 truncate">
                    Originally due on {dueDateStr ? format(new Date(currentTask.dueAt!), "MMM d") : ""}, rolled into today&apos;s deliberate scope.
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                Today
              </span>
            </div>
          )}

          {/* Task History & Provenance Meta Bar */}
          <div className="px-3.5 py-2.5 rounded-lg bg-bg-secondary/50 border border-border-subtle flex items-center justify-between gap-2 text-[11px] text-text-muted flex-wrap">
            <div className="flex items-center gap-1.5">
              <History size={12} className="text-text-muted shrink-0" />
              <span>
                Created {createdDate} ({createdDaysAgo === 0 ? "Today" : `${createdDaysAgo}d ago`})
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px]">
              <span>{sessions.length} {sessions.length === 1 ? "session" : "sessions"}</span>
              <span>•</span>
              <span>{checkIns.length} {checkIns.length === 1 ? "reflection" : "reflections"}</span>
              <span>•</span>
              <span>{formatDuration(actualMinutes)} focus</span>
            </div>
          </div>

          {/* Properties Grid */}
          <div className="grid grid-cols-2 gap-3.5 p-4 rounded-xl bg-bg-secondary/40 border border-border-subtle">
            {/* Status Selector */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-secondary">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full bg-bg-card border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-border-hover cursor-pointer [&>option]:bg-bg-card [&>option]:text-text-primary"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority Selector */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-secondary">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full bg-bg-card border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-border-hover cursor-pointer [&>option]:bg-bg-card [&>option]:text-text-primary"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Due Date Selector */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-secondary flex items-center gap-1">
                <Calendar size={11} className="text-text-muted" />
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-bg-card border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-border-hover cursor-pointer"
              />
            </div>

            {/* Planned Effort */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-secondary flex items-center gap-1">
                <Clock size={11} className="text-text-muted" />
                Planned Effort
              </label>
              <div className="flex items-center gap-2 bg-bg-card border border-border-subtle rounded-md px-2.5 py-1.5 focus-within:border-border-hover transition-colors">
                <input
                  type="number"
                  min="1"
                  max="6000"
                  value={plannedDuration}
                  onChange={(e) => setPlannedDuration(parseInt(e.target.value, 10) || 0)}
                  className="w-14 bg-transparent text-xs text-text-primary font-mono outline-none"
                  placeholder="30"
                />
                <span className="text-[11px] text-text-muted font-mono whitespace-nowrap">
                  mins ({formatDuration(plannedDuration)})
                </span>
              </div>
            </div>

            {/* Actual Duration (Derived dynamically from sessions) */}
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-text-secondary">
                Actual Time (Recorded from sessions)
              </label>
              <div className="px-2.5 py-1.5 rounded-md bg-bg-card border border-border-subtle text-xs font-mono font-medium text-text-primary flex items-center justify-between">
                <span>{formatDuration(actualMinutes)}</span>
                {varianceMinutes !== 0 && actualMinutes > 0 && (
                  <span
                    className={`text-[11px] font-normal ${
                      varianceMinutes > 0 ? "text-amber-600 dark:text-amber-400" : "text-text-primary"
                    }`}
                  >
                    {varianceMinutes > 0 ? `+${varianceMinutes}m variance` : `${varianceMinutes}m under plan`}
                  </span>
                )}
              </div>
            </div>

            {/* Linked Goal Selector */}
            <div className="space-y-1 col-span-2 pt-2 border-t border-border-subtle/60">
              <label className="text-xs font-medium text-text-secondary flex items-center gap-1">
                <Target size={11} className="text-text-muted" />
                Linked Daily Goal
              </label>
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="w-full bg-bg-card border border-border-subtle rounded-md px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-border-hover cursor-pointer [&>option]:bg-bg-card [&>option]:text-text-primary"
              >
                <option value="">Independent Task (No Goal)</option>
                {/* Preserve past goal if goalId exists but not in today's active goals */}
                {goalId && !goals.some((g) => g.id === goalId) && (
                  <option value={goalId}>
                    {currentTask.goalTitle ? `Goal: ${currentTask.goalTitle}` : "Linked Goal (Previous)"}
                  </option>
                )}
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    Goal: {g.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes / Description */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
              <FileText size={13} className="text-text-muted" />
              <span>Notes & Acceptance Criteria</span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add deliberate intention, scope, or notes for this task..."
              rows={3}
              className="w-full rounded-lg border border-border-subtle bg-bg-secondary/40 p-3 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* SESSIONS SECTION: Intentional execution blocks */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={13} className="text-text-muted" />
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Deliberate Focus Sessions
                </h3>
                <span className="text-xs font-mono text-text-muted bg-bg-secondary px-1.5 py-0.2 rounded border border-border-subtle">
                  {sessions.length}
                </span>
              </div>

              {!activeSession && !isDone && (
                <button
                  type="button"
                  onClick={() => startSessionMutation.mutate(currentTask.id)}
                  disabled={startSessionMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg-secondary border border-border-subtle text-xs font-medium text-text-primary hover:border-border-hover transition-colors cursor-pointer"
                >
                  <Play size={10} className="fill-current" />
                  <span>Start Focus</span>
                </button>
              )}
            </div>

            {/* Active / Paused Session Callout */}
            {activeSession && (
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                  activeSession.isPaused
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-bg-secondary border-border-strong"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      activeSession.isPaused ? "bg-amber-500" : "bg-emerald-500 animate-ping"
                    }`}
                  />
                  <span className="text-xs font-semibold text-text-primary">
                    {activeSession.isPaused ? "Focus Paused" : "Session active right now"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {activeSession.isPaused ? (
                    <button
                      type="button"
                      onClick={() => resumeSessionMutation.mutate(activeSession.id)}
                      disabled={resumeSessionMutation.isPending}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors cursor-pointer"
                    >
                      <Play size={11} className="fill-current" />
                      <span>Resume</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pauseSessionMutation.mutate(activeSession.id)}
                      disabled={pauseSessionMutation.isPending}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border-subtle bg-bg-card text-xs font-medium text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors cursor-pointer"
                    >
                      <Pause size={11} />
                      <span>Pause</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const sess = activeSession;
                      endSessionMutation.mutate(sess.id, {
                        onSuccess: () => {
                          setReflectionSession({
                            id: sess.id,
                            taskId: currentTask.id,
                            taskTitle: currentTask.title,
                            durationSeconds: sess.durationSeconds,
                          });
                        },
                      });
                    }}
                    disabled={endSessionMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-rose-500/15 border border-rose-500/30 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 transition-colors cursor-pointer"
                  >
                    <Square size={11} />
                    <span>End Session</span>
                  </button>
                </div>
              </div>
            )}

            {/* Sessions List */}
            {sessions.length === 0 ? (
              <div className="p-4 rounded-xl bg-bg-secondary/30 border border-border-subtle text-center space-y-1">
                <p className="text-xs text-text-muted">
                  No focus sessions recorded for this task yet.
                </p>
                <p className="text-[11px] text-text-muted">
                  Click &ldquo;Start Focus&rdquo; to begin a deliberate execution block.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-bg-secondary/20 overflow-hidden">
                {sessions.map((session, idx) => {
                  const isOngoing = !session.endedAt;
                  let startDate = new Date(session.startedAt);
                  if (session.endedAt && session.durationSeconds) {
                    const endDate = new Date(session.endedAt);
                    const wallClockSec = Math.round((endDate.getTime() - startDate.getTime()) / 1000);
                    if (wallClockSec < session.durationSeconds) {
                      startDate = new Date(endDate.getTime() - session.durationSeconds * 1000);
                    }
                  }
                  const startText = format(startDate, "h:mm a");
                  const endText = session.endedAt
                    ? format(new Date(session.endedAt), "h:mm a")
                    : "now";
                  const durationMins = session.durationSeconds
                    ? Math.round(session.durationSeconds / 60)
                    : null;

                  return (
                    <div
                      key={session.id}
                      className="group px-3.5 py-2.5 flex items-center justify-between text-xs hover:bg-bg-secondary/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="text-[11px] font-mono text-text-muted shrink-0">
                          #{sessions.length - idx}
                        </span>
                        <span className="text-text-primary font-medium shrink-0">
                          {startText} – {endText}
                        </span>
                        {session.notes && (
                          <span className="text-[11px] text-text-muted truncate max-w-[150px]">
                            • {session.notes}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        {isOngoing ? (
                          <span className="text-[10px] font-semibold text-text-primary bg-bg-secondary border border-border-strong px-2 py-0.5 rounded">
                            Active
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-text-muted">
                            {durationMins !== null ? `${durationMins}m` : "0m"}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Delete this focus session?")) {
                              deleteSessionMutation.mutate(session.id);
                            }
                          }}
                          disabled={deleteSessionMutation.isPending}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-text-muted hover:text-rose-500 hover:bg-bg-secondary transition-all cursor-pointer"
                          title="Delete session"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* OBSERVED TELEMETRY EVIDENCE SECTION */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={13} className="text-text-muted" />
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Observed Desktop Telemetry
                </h3>
              </div>

              <Link
                href="/timeline"
                className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                <span>Timeline evidence</span>
                <ArrowRight size={11} />
              </Link>
            </div>

            <div className="p-4 rounded-xl bg-bg-secondary/30 border border-border-subtle space-y-3">
              <p className="text-xs text-text-muted leading-relaxed">
                Activity telemetry observed during this task&apos;s focus periods. This provides observational evidence without auto-completing tasks.
              </p>

              {activitySummary.length === 0 ? (
                <div className="py-2 text-center text-xs text-text-muted">
                  No telemetry recorded during this task&apos;s session windows.
                </div>
              ) : (
                <div className="space-y-2.5 divide-y divide-border-subtle/30">
                  {activitySummary.slice(0, 6).map((act, i) => {
                    const mins = Math.round(act.durationSeconds / 60);
                    const percent = act.percentage ?? 0;
                    return (
                      <div key={i} className="pt-2 first:pt-0 space-y-1">
                        <div className="flex items-center justify-between text-xs gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-text-primary truncate" title={act.title}>
                              {act.title || act.application}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-text-muted mt-0.5">
                              <span className="font-medium text-text-secondary">{act.application}</span>
                              {act.domain && act.domain.toLowerCase() !== act.application.toLowerCase() && (
                                <>
                                  <span>•</span>
                                  <span className="truncate">{act.domain}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {percent > 0 && (
                              <span className="text-[10px] font-mono text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle">
                                {percent}%
                              </span>
                            )}
                            <span className="font-mono text-xs font-medium text-text-primary">
                              {mins > 0 ? `${mins}m` : "< 1m"}
                            </span>
                          </div>
                        </div>
                        {/* Contribution Proportion Bar */}
                        <div className="h-1 w-full bg-bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-text-primary/30 rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(3, Math.min(100, percent))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* LINKED REFLECTIONS & CHECK-INS (50m debriefs & intentional reflections) */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={13} className="text-text-muted" />
                <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Linked Reflections & Check-Ins
                </h3>
                <span className="text-xs font-mono text-text-muted bg-bg-secondary px-1.5 py-0.2 rounded border border-border-subtle">
                  {checkIns.length}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-bg-secondary/30 border border-border-subtle space-y-3">
              <p className="text-xs text-text-muted leading-relaxed">
                50-minute debrief reflections and subjective assessments captured while working on this task.
              </p>

              {checkIns.length === 0 ? (
                <div className="py-2 text-center text-xs text-text-muted">
                  No reflections or check-ins logged for this task yet.
                </div>
              ) : (
                <div className="space-y-3 divide-y divide-border-subtle/40">
                  {checkIns.map((ci) => (
                    <div key={ci.id} className="pt-3 first:pt-0 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-text-muted">
                            {format(new Date(ci.createdAt), "MMM d, h:mm a")}
                          </span>
                          {ci.alignment && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-bg-secondary border border-border-subtle text-text-secondary">
                              {ci.alignment}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {ci.energy && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle">
                              <Zap size={9} className="text-amber-500" />
                              Energy: {ci.energy}
                            </span>
                          )}
                          {ci.focus && (
                            <span className="text-[10px] font-mono text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle">
                              Focus: {ci.focus}
                            </span>
                          )}
                        </div>
                      </div>

                      {(ci.outcome || ci.note) && (
                        <div className="text-xs text-text-primary bg-bg-secondary/50 rounded-lg p-2.5 border border-border-subtle leading-relaxed">
                          {ci.outcome || ci.note}
                        </div>
                      )}

                      {ci.blocker && (
                        <div className="inline-flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-md">
                          <AlertTriangle size={11} className="shrink-0" />
                          <span>Blocker: {ci.blocker}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer info (actions removed per request) */}
        <div className="px-5 py-3.5 border-t border-border-subtle bg-bg-card flex items-center justify-between gap-3">
          <div className="flex flex-col text-[11px] text-text-muted">
            <span>
              Created: {format(new Date(currentTask.createdAt), "MMM d, h:mm a")}
            </span>
            {currentTask.completedAt && (
              <span className="text-text-primary">
                Completed: {format(new Date(currentTask.completedAt), "MMM d, h:mm a")}
              </span>
            )}
          </div>
        </div>
      </div>

      <FocusReflectionModal
        isOpen={Boolean(reflectionSession)}
        onClose={() => setReflectionSession(null)}
        session={reflectionSession}
      />
    </div>
  );
}
