"use client";

import { CheckCircle2, Circle, Clock, Play, Square, ChevronRight, Edit3, Target, Calendar, RotateCcw } from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";
import type { Task } from "@repo/types";
import {
  useUpdateTaskMutation,
  useStartTaskSessionMutation,
  useEndTaskSessionMutation,
} from "../../src/hooks/mutations/use-task-mutations";
import { useSessionsList } from "../../src/hooks/queries/use-tasks";
import { useTodayPlan } from "../../src/hooks/queries/use-plans";
import { PriorityBadge } from "../primitives/data-badge";

interface TaskItemProps {
  task: Task;
  onSelect: (task: Task) => void;
  isPrioritySection?: boolean;
  onRescheduleToday?: (task: Task) => void;
}

export function TaskItem({ task, onSelect, isPrioritySection, onRescheduleToday }: TaskItemProps) {
  const updateTaskMutation = useUpdateTaskMutation();
  const startSessionMutation = useStartTaskSessionMutation();
  const endSessionMutation = useEndTaskSessionMutation();
  const { data: sessions = [] } = useSessionsList();

  const isDone = task.status === "done";
  const hasActiveSession = Boolean(task.hasActiveSession);

  const { data: plan } = useTodayPlan();
  const linkedGoal = plan?.goals?.find((g) => g.id === task.goalId);
  const goalTitle = task.goalTitle || linkedGoal?.title;

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

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isScheduledToday = task.productiveDate === todayStr;
  const isRollover =
    !isDone &&
    Boolean(
      task.productiveDate &&
        task.productiveDate >= todayStr &&
        task.dueAt &&
        isBefore(new Date(task.dueAt), startOfDay(new Date()))
    );

  const isOverdue =
    !isDone &&
    !isRollover &&
    (task.dueAt
      ? isBefore(new Date(task.dueAt), startOfDay(new Date()))
      : Boolean(task.productiveDate && task.productiveDate < todayStr));

  const displayDate = task.dueAt
    ? format(new Date(task.dueAt), "MMM d")
    : task.productiveDate
    ? format(new Date(`${task.productiveDate}T12:00:00`), "MMM d")
    : null;

  return (
    <div
      onClick={() => onSelect(task)}
      className={`group relative flex items-center justify-between px-4 sm:px-5 py-3 transition-colors cursor-pointer ${
        hasActiveSession
          ? "bg-bg-secondary hover:bg-bg-secondary"
          : isDone
          ? "opacity-60 hover:opacity-90 hover:bg-bg-secondary/30"
          : "hover:bg-bg-secondary/40"
      }`}
    >
      {/* Primary: Checkbox + Title + Linked Goal */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Completion Checkbox */}
        <button
          type="button"
          onClick={handleToggleDone}
          disabled={updateTaskMutation.isPending}
          className={`shrink-0 transition-transform active:scale-95 cursor-pointer ${
            isDone
              ? "text-text-primary hover:text-text-primary"
              : "text-text-muted hover:text-text-primary"
          }`}
          title={isDone ? "Mark incomplete" : "Mark completed"}
        >
          {isDone ? (
            <CheckCircle2 size={18} className="fill-text-primary/20" />
          ) : (
            <Circle size={18} />
          )}
        </button>

        {/* Title and notes summary */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span
              className={`text-sm font-medium break-words line-clamp-2 ${
                isDone
                  ? "text-text-muted line-through opacity-75"
                  : "text-text-primary hover:text-text-secondary"
              }`}
            >
              {task.title}
            </span>
            {goalTitle && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary bg-bg-secondary border border-border-subtle px-1.5 py-0.5 rounded shrink-0 max-w-[160px] truncate"
                title={`Linked to goal: ${goalTitle}`}
              >
                <Target size={10} className="shrink-0 text-text-muted" />
                <span className="truncate">{goalTitle}</span>
              </span>
            )}
          </div>
          {task.description && (
            <span className="text-xs text-text-muted break-words line-clamp-2 mt-0.5 font-normal">
              {task.description}
            </span>
          )}
        </div>
      </div>

      {/* Secondary Metadata: Due Date, Priority, Planned, Actual, Sessions */}
      <div className="hidden md:flex items-center gap-3.5 text-xs shrink-0 mr-3">
        {/* Scheduled / Due Date */}
        {displayDate && (
          <span
            className={`inline-flex items-center gap-1 text-xs font-mono ${
              isOverdue && !isDone
                ? "text-rose-600 dark:text-rose-400 font-medium"
                : isRollover
                ? "text-amber-600 dark:text-amber-400 font-medium"
                : "text-text-muted"
            }`}
            title={
              isRollover
                ? `Rollover: Originally due ${format(new Date(task.dueAt!), "PPP")}, scheduled for deliberate execution Today`
                : task.dueAt
                ? `Due: ${format(new Date(task.dueAt), "PPP")}`
                : `Scheduled: ${displayDate}`
            }
          >
            {isRollover ? (
              <RotateCcw size={11} className="shrink-0" />
            ) : (
              <Calendar size={11} className="shrink-0" />
            )}
            <span>{isRollover ? "Rollover (Today)" : displayDate}</span>
          </span>
        )}

        {/* Priority Badge */}
        {task.priority && task.priority !== "none" && (
          <div className={isDone ? "opacity-60" : ""}>
            <PriorityBadge priority={task.priority} />
          </div>
        )}

        {/* Planned */}
        {plannedMinutes > 0 && (
          <span className="text-text-muted font-mono w-10 text-right text-xs">
            {formatDuration(plannedMinutes)}
          </span>
        )}

        {/* Actual */}
        {actualMinutes > 0 && (
          <span className={`font-mono w-10 text-right text-xs ${isDone ? "text-text-muted" : "text-text-primary font-medium"}`}>
            {formatDuration(actualMinutes)}
          </span>
        )}

        {/* Sessions */}
        {(task.sessionsCount || 0) > 0 && (
          <span className="text-text-muted font-mono text-[11px]">
            {task.sessionsCount} sess
          </span>
        )}
      </div>

      {/* Right Actions: Visible on hover or active */}
      <div className={`flex items-center gap-1.5 shrink-0 transition-opacity ${hasActiveSession ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        {/* Active Session Indicator */}
        {hasActiveSession && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-bg-secondary text-text-primary border border-border-strong animate-pulse mr-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-text-primary" />
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
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-500/15 border border-rose-500/25 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 text-xs font-medium transition-colors cursor-pointer"
                title="End active focus session"
              >
                <Square size={11} />
                <span>Pause</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSessionAction}
                disabled={startSessionMutation.isPending}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-bg-secondary border border-border-subtle text-text-primary hover:border-border-hover text-xs font-medium transition-all cursor-pointer"
                title="Start focus session"
              >
                <Play size={10} className="fill-current" />
                <span>Focus</span>
              </button>
            )}
          </div>
        )}

        {/* Move to Today CTA */}
        {onRescheduleToday && !isDone && !isScheduledToday && isOverdue && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRescheduleToday(task);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 text-xs font-medium transition-colors cursor-pointer"
            title="Reschedule to Today"
          >
            <Calendar size={11} />
            <span className="hidden sm:inline">To Today</span>
          </button>
        )}

        {/* Edit Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(task);
          }}
          className="p-1.5 hover:bg-bg-secondary text-text-muted hover:text-text-primary rounded-md transition-colors cursor-pointer"
          title="Edit task intention and goal"
        >
          <Edit3 size={13} />
        </button>

        {/* Chevron */}
        <div className="p-1 text-text-muted group-hover:text-text-secondary transition-colors">
          <ChevronRight size={14} />
        </div>
      </div>
    </div>
  );
}
