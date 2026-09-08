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
  Flame,
  FileText,
  Target,
  Check,
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
  { label: "High", value: "high", color: "text-rose-400" },
  { label: "Medium", value: "medium", color: "text-amber-400" },
  { label: "Low", value: "low", color: "text-blue-400" },
  { label: "None", value: "none", color: "text-[#8f96a8]" },
];

const STATUSES: Array<{ label: string; value: TaskStatus }> = [
  { label: "To Do", value: "todo" },
  { label: "In Progress", value: "in_progress" },
  { label: "Done", value: "done" },
  { label: "Cancelled", value: "cancelled" },
];

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180];

export function TaskDetailDrawer({ task, onClose }: TaskDetailDrawerProps) {
  const taskId = task?.id ?? null;
  const { data: taskDetail, isLoading: isLoadingDetail } = useTaskDetail(taskId);
  const { data: activitySummary = [], isLoading: isLoadingActivity } = useTaskActivity(taskId);
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
  const [lastLoadedId, setLastLoadedId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Sync state ONLY when opening or switching to a different task
  useEffect(() => {
    if (task && task.id !== lastLoadedId) {
      setTitle(task.title || "");
      setDescription(task.description || "");
      setPriority(task.priority || "medium");
      setStatus(task.status || "todo");
      setPlannedDuration(task.plannedDurationMinutes || 30);
      setGoalId(task.goalId || "");
      setLastLoadedId(task.id);
      setIsSaved(false);
    }
  }, [task, lastLoadedId]);

  // If taskDetail arrives with richer description (e.g. if initial task object had none)
  useEffect(() => {
    if (taskDetail && taskDetail.id === lastLoadedId && !description && taskDetail.description) {
      setDescription(taskDetail.description);
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

  // Check if draft has unsaved changes compared to loaded task
  const isDirty =
    title.trim() !== (currentTask.title || "").trim() ||
    description.trim() !== (currentTask.description || "").trim() ||
    status !== currentTask.status ||
    priority !== currentTask.priority ||
    plannedDuration !== (currentTask.plannedDurationMinutes || 30) ||
    (goalId || "") !== (currentTask.goalId || "");

  const handleSaveAll = () => {
    if (!title.trim()) return;
    updateTaskMutation.mutate(
      {
        id: currentTask.id,
        input: {
          title: title.trim(),
          description: description.trim() || null,
          status,
          priority,
          plannedDurationMinutes: plannedDuration,
          goalId: goalId ? goalId : null,
        },
      },
      {
        onSuccess: () => {
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
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Body */}
      <div className="relative w-full max-w-xl bg-[#111319] border-l border-[#232733] shadow-2xl h-full flex flex-col z-10 animate-in slide-in-from-right duration-200 text-[#f4f4f6]">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-[#1e222e] flex items-center justify-between gap-3 bg-[#0d0f15]">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mark Done Checkbox */}
            <button
              type="button"
              onClick={() => setStatus(status === "done" ? "todo" : "done")}
              className={`shrink-0 transition-transform active:scale-95 cursor-pointer ${
                isDone ? "text-emerald-400 hover:text-emerald-300" : "text-[#6b7280] hover:text-[#707df7]"
              }`}
              title={isDone ? "Mark incomplete" : "Mark done"}
            >
              {isDone ? (
                <CheckCircle2 size={20} className="fill-emerald-500/20" />
              ) : (
                <Circle size={20} />
              )}
            </button>

            <span className="text-xs font-semibold uppercase tracking-wider text-[#8f96a8]">
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
                  ? "bg-[#707df7] hover:bg-[#5f6de6] text-white shadow-md shadow-indigo-500/20"
                  : "bg-[#181a24] text-[#6b7280] border border-[#262b3a] cursor-not-allowed opacity-50"
              }`}
              title="Save task changes"
            >
              <Check size={13} />
              <span>{updateTaskMutation.isPending ? "Saving..." : isSaved ? "Saved!" : "Save"}</span>
            </button>

            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 rounded-[var(--radius-sm)] text-[#6b7280] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              title="Delete task"
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-[var(--radius-sm)] text-[#6b7280] hover:text-[#f4f4f6] hover:bg-[#1a1c26] transition-colors cursor-pointer"
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
              <label className="text-[10px] uppercase font-semibold tracking-wider text-[#6b7280]">
                Task Title
              </label>
              {isDirty && (
                <span className="text-[10px] text-amber-400 font-medium">● Unsaved changes</span>
              )}
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveAll()}
              placeholder="Task title..."
              className="w-full bg-[#0a0c11] border border-[#262b3a] focus:border-[#707df7] rounded-[var(--radius-sm)] p-2.5 text-sm sm:text-base font-semibold text-[#f4f4f6] outline-none transition-colors"
            />
          </div>

          {/* Properties Grid */}
          <div className="grid grid-cols-2 gap-3 p-4 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b]">
            {/* Status Selector */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold tracking-wider text-[#6b7280]">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full bg-[#141720] border border-[#262b3a] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs text-[#f4f4f6] outline-none focus:border-[#707df7] cursor-pointer [&>option]:bg-[#141720] [&>option]:text-[#f4f4f6]"
              >
                {STATUSES.map((s) => (
                  <option
                    key={s.value}
                    value={s.value}
                    style={{ backgroundColor: "#141720", color: "#f4f4f6" }}
                  >
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority Selector */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold tracking-wider text-[#6b7280]">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full bg-[#141720] border border-[#262b3a] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs text-[#f4f4f6] outline-none focus:border-[#707df7] cursor-pointer [&>option]:bg-[#141720] [&>option]:text-[#f4f4f6]"
              >
                {PRIORITIES.map((p) => (
                  <option
                    key={p.value}
                    value={p.value}
                    style={{ backgroundColor: "#141720", color: "#f4f4f6" }}
                  >
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Planned Effort */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold tracking-wider text-[#6b7280]">
                Planned Effort
              </label>
              <select
                value={plannedDuration}
                onChange={(e) => setPlannedDuration(Number(e.target.value))}
                className="w-full bg-[#141720] border border-[#262b3a] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs text-[#f4f4f6] font-mono outline-none focus:border-[#707df7] cursor-pointer [&>option]:bg-[#141720] [&>option]:text-[#f4f4f6]"
              >
                {DURATION_OPTIONS.map((mins) => (
                  <option
                    key={mins}
                    value={mins}
                    style={{ backgroundColor: "#141720", color: "#f4f4f6" }}
                  >
                    {formatDuration(mins)} (planned)
                  </option>
                ))}
              </select>
            </div>

            {/* Actual Duration (Derived dynamically from sessions) */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-semibold tracking-wider text-[#6b7280]">
                Actual Time (From Sessions)
              </label>
              <div className="px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-[#141720] border border-[#262b3a] text-xs font-mono font-bold text-emerald-400 flex items-center justify-between">
                <span>{formatDuration(actualMinutes)}</span>
                {varianceMinutes !== 0 && actualMinutes > 0 && (
                  <span
                    className={`text-[10px] font-normal ${
                      varianceMinutes > 0 ? "text-amber-400" : "text-emerald-400"
                    }`}
                  >
                    {varianceMinutes > 0 ? `+${varianceMinutes}m` : `${varianceMinutes}m`}
                  </span>
                )}
              </div>
            </div>

            {/* Linked Goal Selector */}
            <div className="space-y-1 col-span-2 pt-1 border-t border-[#1b1f2b]">
              <label className="text-[10px] uppercase font-semibold tracking-wider text-[#6b7280] flex items-center gap-1">
                <Target size={11} className="text-[#707df7]" />
                Linked Daily Goal
              </label>
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="w-full bg-[#141720] border border-[#262b3a] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs text-[#f4f4f6] outline-none focus:border-[#707df7] cursor-pointer [&>option]:bg-[#141720] [&>option]:text-[#f4f4f6]"
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
            </div>
          </div>

          {/* Notes / Description */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8f96a8]">
              <FileText size={13} className="text-[#707df7]" />
              <span>Notes & Acceptance Criteria</span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add deliberate intention, scope, or notes for this task..."
              rows={3}
              className="w-full rounded-[var(--radius-md)] border border-[#232733] bg-[#0c0d12] p-3 text-xs text-[#f4f4f6] placeholder-[#4f566a] outline-none focus:border-[#707df7] transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* SESSIONS SECTION: The Core Data Relationship */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-[#707df7]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8f96a8]">
                  Deliberate Focus Sessions
                </h3>
                <span className="text-[10px] font-mono text-[#6b7280] bg-[#1a1c26] px-1.5 py-0.5 rounded">
                  {sessions.length}
                </span>
              </div>

              {!activeSession && !isDone && (
                <button
                  type="button"
                  onClick={() => startSessionMutation.mutate(currentTask.id)}
                  disabled={startSessionMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] bg-[#707df7]/15 border border-[#707df7]/30 text-xs font-semibold text-[#707df7] hover:bg-[#707df7]/25 transition-colors"
                >
                  <Play size={11} fill="currentColor" />
                  <span>Start Session</span>
                </button>
              )}
            </div>

            {/* Active Session Callout if this task is active */}
            {activeSession && (
              <div className="p-3 rounded-[var(--radius-md)] bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-xs font-semibold text-emerald-400">
                    Session active right now
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => endSessionMutation.mutate(activeSession.id)}
                  disabled={endSessionMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  <Square size={11} />
                  <span>End Session</span>
                </button>
              </div>
            )}

            {/* Sessions List */}
            {sessions.length === 0 ? (
              <div className="p-4 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b] text-center space-y-1">
                <p className="text-xs text-[#6b7280]">
                  No sessions recorded for this task yet.
                </p>
                <p className="text-[11px] text-[#4f566a]">
                  Click "Start Session" to begin a focused work period.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#1b1f2b] rounded-[var(--radius-md)] border border-[#1d212b] bg-[#0c0d12] overflow-hidden">
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
                        <span className="text-[11px] font-mono text-[#6b7280]">
                          #{sessions.length - idx}
                        </span>
                        <span className="text-[#f4f4f6] font-medium">
                          {startText} – {endText}
                        </span>
                        {session.notes && (
                          <span className="text-[11px] text-[#8f96a8] truncate max-w-[150px]">
                            • {session.notes}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isOngoing ? (
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded">
                            Active
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-[#8f96a8]">
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
                <Activity size={14} className="text-[#707df7]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#8f96a8]">
                  Observed Desktop Telemetry
                </h3>
              </div>

              <Link
                href="/timeline"
                className="inline-flex items-center gap-1 text-xs text-[#707df7] hover:text-[#8b96fa] transition-colors"
              >
                <span>View timeline evidence</span>
                <ArrowRight size={12} />
              </Link>
            </div>

            <div className="p-4 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b] space-y-3">
              <p className="text-[11px] text-[#6b7280] leading-relaxed">
                ActivityWatch telemetry observed during this task's focus sessions. This evidence validates execution without automatically closing tasks.
              </p>

              {activitySummary.length === 0 ? (
                <div className="py-2 text-center text-[11px] text-[#4f566a]">
                  No desktop activity telemetry matched session time intervals yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {activitySummary.slice(0, 5).map((act, i) => {
                    const mins = Math.round(act.durationSeconds / 60);
                    return (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#c0bfca] truncate max-w-[200px]">
                          {act.application}
                        </span>
                        <span className="font-mono text-[#8f96a8]">
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
        <div className="p-4 border-t border-[#1e222e] bg-[#0d0f15] flex items-center justify-between gap-3">
          <div className="flex flex-col text-[11px] text-[#6b7280]">
            <span>
              Created: {format(new Date(currentTask.createdAt), "MMM d, HH:mm")}
            </span>
            {currentTask.completedAt && (
              <span className="text-emerald-400">
                Completed: {format(new Date(currentTask.completedAt), "MMM d, HH:mm")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-[var(--radius-sm)] text-xs text-[#8f96a8] hover:text-[#f4f4f6] hover:bg-[#181a24] border border-transparent hover:border-[#262b3a] transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={!isDirty || updateTaskMutation.isPending || !title.trim()}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold transition-all cursor-pointer ${
                isDirty && title.trim()
                  ? "bg-[#707df7] hover:bg-[#5f6de6] text-white shadow-md shadow-indigo-500/20"
                  : "bg-[#181a24] text-[#6b7280] border border-[#262b3a] cursor-not-allowed opacity-50"
              }`}
            >
              <Check size={14} />
              <span>{updateTaskMutation.isPending ? "Saving..." : isSaved ? "Saved!" : "Save Changes"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
