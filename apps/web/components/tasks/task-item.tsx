"use client";

import { CheckCircle2, Circle, Clock, Play, Square, ChevronRight, Flag, Flame } from "lucide-react";
import type { Task } from "@repo/types";
import {
  useUpdateTaskMutation,
  useStartTaskSessionMutation,
  useEndTaskSessionMutation,
} from "../../src/hooks/mutations/use-task-mutations";
import { useSessionsList } from "../../src/hooks/queries/use-tasks";

interface TaskItemProps {
  task: Task;
  onSelect: (task: Task) => void;
  isPrioritySection?: boolean;
}

export function TaskItem({ task, onSelect, isPrioritySection }: TaskItemProps) {
  const updateTaskMutation = useUpdateTaskMutation();
  const startSessionMutation = useStartTaskSessionMutation();
  const endSessionMutation = useEndTaskSessionMutation();
  const { data: sessions = [] } = useSessionsList();

  const isDone = task.status === "done";
  const isInProgress = task.status === "in_progress";
  const hasActiveSession = Boolean(task.hasActiveSession);

  // Find the active session for this task if one exists
  const activeSession = sessions.find((s) => s.taskId === task.id && !s.endedAt);

  const handleToggleDone = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = isDone ? "todo" : "done";
    updateTaskMutation.mutate({
      id: task.id,
      input: { status: nextStatus },
    });
  };

  const handleSessionAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasActiveSession && activeSession) {
      endSessionMutation.mutate(activeSession.id);
    } else {
      startSessionMutation.mutate(task.id);
    }
  };

  // Format actual duration from seconds
  const actualMinutes = Math.round((task.actualDurationSeconds || 0) / 60);
  const plannedMinutes = task.plannedDurationMinutes || 0;

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  // Variance calculation
  const varianceMinutes = actualMinutes - plannedMinutes;

  return (
    <div
      onClick={() => onSelect(task)}
      className={`group relative flex items-center justify-between p-3.5 sm:p-4 rounded-[var(--radius-md)] border transition-all cursor-pointer ${
        hasActiveSession
          ? "border-emerald-500/40 bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.06)]"
          : isDone
          ? "border-[#1c202a] bg-[#0c0d12]/50 opacity-60 hover:opacity-100"
          : isPrioritySection
          ? "border-[#282e3f] bg-[#11141e] hover:border-[#3d455d] hover:bg-[#151926]"
          : "border-[#1e222e] bg-[#0f1118] hover:border-[#32394c] hover:bg-[#141722]"
      }`}
    >
      {/* Primary: Checkbox + Title */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Completion Checkbox (Explicit user action!) */}
        <button
          type="button"
          onClick={handleToggleDone}
          disabled={updateTaskMutation.isPending}
          className={`shrink-0 transition-transform active:scale-95 ${
            isDone
              ? "text-emerald-400 hover:text-emerald-300"
              : "text-[#6b7280] hover:text-[#707df7]"
          }`}
          title={isDone ? "Mark incomplete" : "Mark completed"}
        >
          {isDone ? (
            <CheckCircle2 size={18} className="fill-emerald-500/20" />
          ) : (
            <Circle size={18} />
          )}
        </button>
        {/* Title and notes summary */}
        <div className="flex flex-col min-w-0">
          <span
            className={`text-xs sm:text-sm font-medium truncate ${
              isDone
                ? "text-[#555c70] line-through"
                : "text-[#f4f4f6] group-hover:text-white"
            }`}
          >
            {task.title}
          </span>
          {task.description && (
            <span className="text-[11px] text-[#6b7280] truncate mt-0.5 font-normal">
              {task.description}
            </span>
          )}
        </div>
      </div>

      {/* Secondary: Priority, Planned, Actual, Sessions (Recedes if Done) */}
      <div className="hidden md:flex items-center gap-4 text-xs shrink-0 mr-4">
        {/* Priority */}
        {task.priority === "high" && !isDone && (
          <span className="text-rose-400 font-bold uppercase tracking-wider text-[10px]" title="High Priority">
            HIGH
          </span>
        )}
        {task.priority === "medium" && !isDone && (
          <span className="text-amber-500/80 font-medium uppercase tracking-wider text-[10px]" title="Medium Priority">
            MED
          </span>
        )}

        {/* Planned */}
        {plannedMinutes > 0 && (
          <span className="text-[#8f96a8] font-mono w-10 text-right">
            {formatDuration(plannedMinutes)}
          </span>
        )}

        {/* Actual */}
        {actualMinutes > 0 && (
          <span className={`font-mono w-10 text-right ${isDone ? "text-[#555c70]" : "text-emerald-400"}`}>
            {formatDuration(actualMinutes)}
          </span>
        )}

        {/* Sessions */}
        {(task.sessionsCount || 0) > 0 && (
          <span className="text-[#6b7280] font-mono text-[10px] w-16">
            {task.sessionsCount} session{task.sessionsCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Right: Actions (Visible on hover or active) */}
      <div className={`flex items-center gap-2 shrink-0 transition-opacity ${hasActiveSession ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        {/* Active Session Indicator Pill */}
        {hasActiveSession && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-bold tracking-wide uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse mr-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Active
          </span>
        )}

        {/* Start / End Session CTA */}
        {!isDone && (
          <div className="flex items-center">
            {hasActiveSession ? (
              <button
                type="button"
                onClick={handleSessionAction}
                disabled={endSessionMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 text-xs font-semibold transition-colors"
                title="End active focus session"
              >
                <Square size={12} />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSessionAction}
                disabled={startSessionMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] bg-[#1a1c28] border border-[#2b3042] text-[#8f96a8] hover:text-[#f4f4f6] hover:bg-[#707df7] hover:border-[#707df7] text-xs font-medium transition-all group-hover:border-[#3f4760]"
                title="Start deliberate focus session"
              >
                <Play size={12} className="text-[#707df7] group-hover:text-white" />
                <span>Start</span>
              </button>
            )}
          </div>
        )}

        {/* More Actions (Chevron) */}
        <div className="p-1.5 hover:bg-[#1a1c28] rounded-[var(--radius-sm)] transition-colors">
          <ChevronRight size={14} className="text-[#4b5162] group-hover:text-[#8f96a8]" />
        </div>
      </div>
    </div>
  );
}
