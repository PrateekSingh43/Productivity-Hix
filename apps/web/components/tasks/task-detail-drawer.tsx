"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  X,
  CheckCircle2,
  Circle,
  Play,
  Square,
  Clock,
  Calendar,
  Layers,
  Activity,
  ArrowRight,
  Trash2,
  FileText,
  Target,
} from "lucide-react";
import Link from "next/link";
import type { Task, TaskPriority, TaskStatus } from "@repo/types";
import {
  useTaskDetail,
  useTaskActivity,
} from "../../src/hooks/queries/use-tasks";
import { useTodayPlan } from "../../src/hooks/queries/use-plans";
import {
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useStartTaskSessionMutation,
  useEndTaskSessionMutation,
} from "../../src/hooks/mutations/use-task-mutations";

interface TaskDetailDrawerProps {
  task: Task | null;
  onClose: () => void;
}

const PRIORITIES: Array<{ label: string; value: TaskPriority; color: string }> = [
  { label: "High", value: "high", color: "text-rose-500" },
  { label: "Medium", value: "medium", color: "text-amber-500" },
  { label: "Low", value: "low", color: "text-blue-500" },
  { label: "None", value: "none", color: "text-text-muted" },
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
          setTimeout(() => setIsSaved(false), 2500);
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

  const sessions = taskDetail?.sessions || [];
  const activeSession = sessions.find((s) => !s.endedAt);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Body */}
      <div className="relative w-full max-w-xl bg-bg-card border-l border-border-subtle shadow-2xl h-full flex flex-col z-10 animate-in slide-in-from-right duration-200 text-text-primary">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between gap-3 bg-bg-card">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mark Done Checkbox */}
            <button
              type="button"
              onClick={() => setStatus(status === "done" ? "todo" : "done")}
              className={`shrink-0 transition-transform active:scale-95 cursor-pointer ${
                isDone ? "text-emerald-500 hover:text-emerald-600" : "text-text-muted hover:text-text-primary"
              }`}
              title={isDone ? "Mark incomplete" : "Mark done"}
            >
              {isDone ? (
                <CheckCircle2 size={20} className="fill-emerald-500/20" />
              ) : (
                <Circle size={20} />
              )}
            </button>

            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Task Intention
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Save Button */}
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={!title.trim() || updateTaskMutation.isPending || !isDirty}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold transition-all cursor-pointer ${
                isDirty
                  ? "bg-text-primary text-bg-primary hover:opacity-90 shadow-sm"
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
              className="p-1.5 rounded-[var(--radius-sm)] text-text-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Delete task"
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-[var(--radius-sm)] text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Title Editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-semibold tracking-wider text-text-muted">
                Task Title
              </label>
              {isDirty && (
                <span className="text-[10px] text-amber-500 font-medium">● Unsaved changes</span>
              )}
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveAll()}
              placeholder="Task title..."
              className="w-full bg-bg-secondary border border-border-subtle focus:border-border-hover rounded-[var(--radius-sm)] p-2.5 text-sm sm:text-base font-semibold text-text-primary outline-none transition-colors"
            />
          </div>

          {/* Properties Grid */}
          <div className="grid grid-cols-2 gap-3 p-4 rounded-[var(--radius-md)] bg-bg-secondary border border-border-subtle">
            {/* Status Selector */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold tracking-wider text-text-muted">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full bg-bg-card border border-border-subtle rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-border-hover cursor-pointer [&>option]:bg-bg-card [&>option]:text-text-primary"
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
              <label className="text-[10px] uppercase font-semibold tracking-wider text-text-muted">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full bg-bg-card border border-border-subtle rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-border-hover cursor-pointer [&>option]:bg-bg-card [&>option]:text-text-primary"
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
              <label className="text-[10px] uppercase font-semibold tracking-wider text-text-muted flex items-center gap-1">
                <Calendar size={11} className="text-text-muted" />
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-bg-card border border-border-subtle rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-border-hover cursor-pointer"
              />
            </div>

            {/* Planned Effort */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold tracking-wider text-text-muted flex items-center gap-1">
                <Clock size={11} className="text-text-muted" />
                Planned Effort
              </label>
              <select
                value={plannedDuration}
                onChange={(e) => setPlannedDuration(Number(e.target.value))}
                className="w-full bg-bg-card border border-border-subtle rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs text-text-primary font-mono outline-none focus:border-border-hover cursor-pointer [&>option]:bg-bg-card [&>option]:text-text-primary"
              >
                {DURATION_OPTIONS.map((mins) => (
                  <option key={mins} value={mins}>
                    {formatDuration(mins)} (planned)
                  </option>
                ))}
              </select>
            </div>

            {/* Actual Duration (Derived dynamically from sessions) */}
            <div className="space-y-1 col-span-2">
              <label className="text-[10px] uppercase font-semibold tracking-wider text-text-muted">
                Actual Time (From Sessions)
              </label>
              <div className="px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-bg-card border border-border-subtle text-xs font-mono font-bold text-emerald-500 flex items-center justify-between">
                <span>{formatDuration(actualMinutes)}</span>
                {varianceMinutes !== 0 && actualMinutes > 0 && (
                  <span
                    className={`text-[10px] font-normal ${
                      varianceMinutes > 0 ? "text-amber-500" : "text-emerald-500"
                    }`}
                  >
                    {varianceMinutes > 0 ? `+${varianceMinutes}m` : `${varianceMinutes}m`}
                  </span>
                )}
              </div>
            </div>

            {/* Linked Goal Selector */}
            <div className="space-y-1 col-span-2 pt-1 border-t border-border-subtle">
              <label className="text-[10px] uppercase font-semibold tracking-wider text-text-muted flex items-center gap-1">
                <Target size={11} className="text-text-muted" />
                Linked Daily Goal
              </label>
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="w-full bg-bg-card border border-border-subtle rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-border-hover cursor-pointer [&>option]:bg-bg-card [&>option]:text-text-primary"
              >
                <option value="">
                  Independent Task (No Goal)
                </option>
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
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
              <FileText size={13} className="text-text-muted" />
              <span>Notes & Acceptance Criteria</span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add deliberate intention, scope, or notes for this task..."
              rows={3}
              className="w-full rounded-[var(--radius-md)] border border-border-subtle bg-bg-secondary p-3 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* SESSIONS SECTION: The Core Data Relationship */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-text-muted" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                  Deliberate Focus Sessions
                </h3>
                <span className="text-[10px] font-mono text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded">
                  {sessions.length}
                </span>
              </div>

              {!activeSession && !isDone && (
                <button
                  type="button"
                  onClick={() => startSessionMutation.mutate(currentTask.id)}
                  disabled={startSessionMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] bg-bg-secondary border border-border-subtle text-xs font-semibold text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
                >
                  <Play size={11} fill="currentColor" />
                  <span>Start Session</span>
                </button>
              )}
            </div>

            {/* Active Session Callout if this task is active */}
            {activeSession && (
              <div className="p-3 rounded-[var(--radius-md)] bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-xs font-semibold text-emerald-500">
                    Session active right now
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => endSessionMutation.mutate(activeSession.id)}
                  disabled={endSessionMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] bg-rose-500/20 border border-rose-500/30 text-xs font-semibold text-rose-500 hover:bg-rose-500/30 transition-colors cursor-pointer"
                >
                  <Square size={11} />
                  <span>End Session</span>
                </button>
              </div>
            )}

            {/* Sessions List */}
            {sessions.length === 0 ? (
              <div className="p-4 rounded-[var(--radius-md)] bg-bg-secondary border border-border-subtle text-center space-y-1">
                <p className="text-xs text-text-muted">
                  No sessions recorded for this task yet.
                </p>
                <p className="text-[11px] text-text-muted opacity-80">
                  Click "Start Session" to begin a focused work period.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border-subtle rounded-[var(--radius-md)] border border-border-subtle bg-bg-secondary overflow-hidden">
                {sessions.map((session, idx) => {
                  const isOngoing = !session.endedAt;
                  const startText = format(new Date(session.startedAt), "HH:mm");
                  const endText = session.endedAt
                    ? format(new Date(session.endedAt), "HH:mm")
                    : "now";
                  const durationMins = session.durationSeconds
                    ? Math.round(session.durationSeconds / 60)
                    : null;

                  return (
                    <div
                      key={session.id}
                      className="p-3 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-[11px] font-mono text-text-muted">
                          #{sessions.length - idx}
                        </span>
                        <span className="text-text-primary font-medium">
                          {startText} – {endText}
                        </span>
                        {session.notes && (
                          <span className="text-[11px] text-text-muted truncate max-w-[150px]">
                            • {session.notes}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isOngoing ? (
                          <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded">
                            Active
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-text-muted">
                            {durationMins !== null ? `${durationMins}m` : "0m"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* OBSERVED TELEMETRY EVIDENCE SECTION */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-text-muted" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                  Observed Desktop Telemetry
                </h3>
              </div>

              <Link
                href="/timeline"
                className="inline-flex items-center gap-1 text-xs text-text-primary hover:opacity-80 transition-opacity"
              >
                <span>View timeline evidence</span>
                <ArrowRight size={12} />
              </Link>
            </div>

            <div className="p-4 rounded-[var(--radius-md)] bg-bg-secondary border border-border-subtle space-y-3">
              <p className="text-[11px] text-text-muted leading-relaxed">
                ActivityWatch telemetry observed during this task's focus sessions. This evidence validates execution without automatically closing tasks.
              </p>

              {activitySummary.length === 0 ? (
                <div className="py-2 text-center text-[11px] text-text-muted opacity-80">
                  No desktop activity telemetry matched session time intervals yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {activitySummary.slice(0, 5).map((act, i) => {
                    const mins = Math.round(act.durationSeconds / 60);
                    return (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-text-primary truncate max-w-[200px]">
                          {act.application}
                        </span>
                        <span className="font-mono text-text-muted">
                          {mins > 0 ? `${mins}m` : "< 1m"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer actions & info */}
        <div className="p-4 border-t border-border-subtle bg-bg-card flex items-center justify-between gap-3">
          <div className="flex flex-col text-[11px] text-text-muted">
            <span>
              Created: {format(new Date(currentTask.createdAt), "MMM d, HH:mm")}
            </span>
            {currentTask.completedAt && (
              <span className="text-emerald-500">
                Completed: {format(new Date(currentTask.completedAt), "MMM d, HH:mm")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs text-text-muted hover:text-text-primary hover:bg-bg-secondary border border-transparent hover:border-border-subtle transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={!isDirty || updateTaskMutation.isPending || !title.trim()}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold transition-all cursor-pointer ${
                isDirty && title.trim()
                  ? "bg-text-primary text-bg-primary hover:opacity-90 shadow-xs"
                  : "bg-bg-secondary text-text-muted border border-border-subtle cursor-not-allowed opacity-50"
              }`}
            >
              <CheckmarkIcon size={14} />
              <span>{updateTaskMutation.isPending ? "Saving..." : isSaved ? "Saved!" : "Save Changes"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
