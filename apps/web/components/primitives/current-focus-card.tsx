import React from "react";
import { Play, Pause, CheckCircle2, Monitor, Globe, Radio, ListTodo } from "lucide-react";
import { PriorityBadge } from "./data-badge";

export interface CurrentFocusCardProps {
  isActive?: boolean;
  taskTitle?: string;
  taskPriority?: string;
  supportingPriority?: string;
  elapsedSeconds?: number;
  observedApplication?: string;
  observedTitle?: string;
  observedType?: "desktop" | "browser" | "afk" | "other";
  onPause?: () => void;
  onResume?: () => void;
  onComplete?: () => void;
  onStartFocus?: () => void;
  onChooseTask?: () => void;
  className?: string;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function CurrentFocusCard({
  isActive = false,
  taskTitle,
  taskPriority,
  supportingPriority,
  elapsedSeconds = 0,
  observedApplication,
  observedTitle,
  observedType = "desktop",
  onPause,
  onResume,
  onComplete,
  onStartFocus,
  onChooseTask,
  className = "",
}: CurrentFocusCardProps) {
  // 1. INACTIVE STATE
  if (!isActive) {
    const hasTask = Boolean(taskTitle && taskTitle.trim().length > 0);

    return (
      <div
        className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${className}`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--foreground-primary)]">
              Current Focus
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
            <span className="text-xs text-[var(--foreground-muted)]">
              {hasTask ? "Task selected" : "No task selected"}
            </span>
          </div>
          <p className="text-xs text-[var(--foreground-muted)]">
            {hasTask
              ? `Ready to execute: "${taskTitle}"`
              : "Select a task to begin an intentional focus session."}
          </p>
        </div>

        {hasTask ? (
          <button
            type="button"
            onClick={onStartFocus}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--foreground-primary)] hover:opacity-90 text-[var(--background-primary)] text-xs font-medium px-4 py-2 transition-opacity shrink-0"
          >
            <Play size={13} className="fill-current" />
            <span>Start Focus</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onChooseTask}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--background-subtle)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[var(--foreground-primary)] text-xs font-medium px-3.5 py-1.5 transition-colors shrink-0"
          >
            <ListTodo size={13} />
            <span>Choose Task</span>
          </button>
        )}
      </div>
    );
  }

  // 2. ACTIVE SESSION STATE (Session identity stronger than timer)
  return (
    <div
      className={`rounded-lg border border-[var(--border-hover)] bg-[var(--background-card)] p-5 space-y-4 ${className}`}
    >
      {/* Header: Session Status & Elapsed Time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--foreground-primary)]">
            Current Focus
          </span>
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-medium text-emerald-400">
            Active Session
          </span>
        </div>

        <div className="text-sm font-mono text-[var(--foreground-muted)]">
          <span className="text-[var(--foreground-primary)] font-semibold text-base">
            {formatElapsed(elapsedSeconds)}
          </span>{" "}
          elapsed
        </div>
      </div>

      {/* Task & Priority Alignment */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs text-[var(--foreground-muted)]">Task:</span>
          <h3 className="text-sm font-medium text-[var(--foreground-primary)]">
            {taskTitle || "Untitled Focus Session"}
          </h3>
          {taskPriority && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
              Task Priority: {taskPriority}
            </span>
          )}
        </div>

        {supportingPriority && (
          <p className="text-xs text-[var(--foreground-muted)]">
            Supports:{" "}
            <span className="text-[var(--foreground-primary)]">
              {supportingPriority.includes("Daily Priority")
                ? supportingPriority
                : `Daily Priority 1 — ${supportingPriority}`}
            </span>
          </p>
        )}
      </div>

      {/* Telemetry Observation Signal */}
      <div className="p-2.5 rounded-md bg-[var(--background-subtle)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 truncate">
          {observedType === "browser" ? (
            <Globe
              size={13}
              className="text-[var(--foreground-muted)] shrink-0"
              aria-label="Browser activity"
            />
          ) : (
            <Monitor
              size={13}
              className="text-[var(--foreground-muted)] shrink-0"
              aria-label="Desktop application"
            />
          )}
          <span className="text-[var(--foreground-muted)] truncate">
            {observedType === "browser"
              ? "Browser activity: "
              : "Desktop application: "}
            <span className="text-[var(--foreground-primary)] font-medium">
              {observedApplication || "Active window"}
            </span>
            {observedTitle && (
              <span className="text-[var(--foreground-muted)] font-normal">
                {" "}
                — {observedTitle}
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-[var(--foreground-muted)] font-mono">
          <Radio size={11} className="text-emerald-400" />
          <span>telemetry</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border-subtle)]">
        {onPause && (
          <button
            type="button"
            onClick={onPause}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-[var(--border-subtle)] hover:bg-[var(--background-subtle)] text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] transition-colors"
          >
            <Pause size={12} />
            <span>Pause</span>
          </button>
        )}
        {onComplete && (
          <button
            type="button"
            onClick={onComplete}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-md bg-[var(--foreground-primary)] text-[var(--background-primary)] hover:opacity-90 transition-opacity"
          >
            <CheckCircle2 size={13} />
            <span>Complete Focus</span>
          </button>
        )}
      </div>
    </div>
  );
}
