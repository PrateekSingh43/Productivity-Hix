"use client";

import React, { useState } from "react";
import {
  Play,
  Pause,
  CheckCircle2,
  ListTodo,
  Plus,
  Target,
  Clock,
  Radio,
  RotateCcw,
  ChevronRight,
} from "lucide-react";
import type { Task } from "@repo/types";
import { PriorityBadge } from "./data-badge";
import Link from "next/link";

export interface CurrentFocusCardProps {
  isActive?: boolean;
  selectedTask?: Task | null;
  availableTasks?: Task[];
  elapsedSeconds?: number;
  observedApplication?: string;
  observedDomain?: string;
  observedTitle?: string;
  onSelectTask?: (task: Task) => void;
  onStartFocus?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onComplete?: () => void;
  onAddTask?: () => void;
  className?: string;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function CurrentFocusCard({
  isActive = false,
  selectedTask = null,
  availableTasks = [],
  elapsedSeconds = 0,
  observedApplication,
  observedDomain,
  observedTitle,
  onSelectTask,
  onStartFocus,
  onPause,
  onResume,
  onComplete,
  onAddTask,
  className = "",
}: CurrentFocusCardProps) {
  const [isChoosing, setIsChoosing] = useState(false);

  // 1. ACTIVE SESSION STATE (Operational, high-contrast, dominant timer)
  if (isActive && selectedTask) {
    const observedContext = observedDomain
      ? `${observedApplication || "Browser"} · ${observedDomain}`
      : observedTitle
      ? `${observedApplication || "Desktop"} · ${observedTitle}`
      : observedApplication;

    return (
      <div
        className={`rounded-xl border border-emerald-500/30 bg-bg-card p-6 sm:p-7 space-y-5 ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Focus Session Active
              </span>
              {selectedTask.goalTitle && (
                <>
                  <span className="text-text-muted text-xs">·</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary bg-bg-secondary border border-border-subtle px-2 py-0.5 rounded">
                    <Target size={11} className="text-text-muted" />
                    <span>{selectedTask.goalTitle}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-mono text-text-muted">Elapsed</span>
            <span className="text-3xl sm:text-4xl font-semibold font-mono tabular-nums text-text-primary">
              {formatElapsed(elapsedSeconds)}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-semibold text-text-primary tracking-tight">
            {selectedTask.title}
          </h2>
          {selectedTask.description && (
            <p className="text-xs sm:text-sm text-text-muted leading-relaxed max-w-2xl">
              {selectedTask.description}
            </p>
          )}
        </div>

        {/* Realtime Observed Telemetry */}
        {observedContext && (
          <div className="flex items-center gap-2 text-xs text-text-secondary bg-bg-secondary/60 border border-border-subtle px-3.5 py-2 rounded-lg">
            <Radio size={12} className="text-emerald-500 shrink-0 animate-pulse" />
            <span className="truncate">
              Live Observation: <strong className="text-text-primary font-medium">{observedContext}</strong>
            </span>
          </div>
        )}

        {/* Execution Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border-subtle">
          {onPause && (
            <button
              type="button"
              onClick={onPause}
              className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary bg-bg-secondary border border-border-subtle hover:border-border-hover px-3.5 py-2 rounded-md transition-colors cursor-pointer"
            >
              <Pause size={12} />
              <span>Pause</span>
            </button>
          )}
          {onComplete && (
            <button
              type="button"
              onClick={onComplete}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md transition-colors cursor-pointer"
            >
              <CheckCircle2 size={13} />
              <span>Complete Focus</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // 2. TASK SELECTED, READY TO START FOCUS (Clean launchpad)
  if (selectedTask && !isChoosing) {
    return (
      <div
        className={`rounded-xl border border-border-subtle bg-bg-card p-6 space-y-4 ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-text-primary" />
            <span className="text-xs font-medium text-text-muted">
              Ready to Focus
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsChoosing(true)}
            className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            Switch Task
          </button>
        </div>

        <div className="space-y-1.5">
          <h2 className="text-lg sm:text-xl font-semibold text-text-primary tracking-tight">
            {selectedTask.title}
          </h2>
          <div className="flex items-center gap-3 text-xs text-text-muted flex-wrap">
            {selectedTask.goalTitle ? (
              <span className="flex items-center gap-1 text-text-secondary">
                <Target size={12} className="text-text-muted" />
                <span>Goal: {selectedTask.goalTitle}</span>
              </span>
            ) : (
              <span>Independent Task</span>
            )}
            <span>·</span>
            <span className="flex items-center gap-1 font-mono">
              <Clock size={11} />
              <span>Planned: {selectedTask.plannedDurationMinutes ?? 30}m</span>
            </span>
            <PriorityBadge priority={selectedTask.priority} />
          </div>
        </div>

        <div className="pt-3 border-t border-border-subtle flex items-center justify-between">
          <span className="text-xs text-text-muted">
            Ready to begin deliberate focus block
          </span>
          <button
            type="button"
            onClick={onStartFocus}
            className="inline-flex items-center gap-1.5 rounded-md bg-text-primary hover:opacity-90 text-bg-default text-xs font-medium px-4 py-2 transition-opacity cursor-pointer shadow-xs"
          >
            <Play size={11} className="fill-current" />
            <span>Start Focus</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. TASK CHOOSER (Incomplete tasks available)
  const incompleteTasks = availableTasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  );

  if (incompleteTasks.length > 0) {
    return (
      <div
        className={`rounded-xl border border-border-subtle bg-bg-card p-5 sm:p-6 space-y-4 ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-muted">
              Choose Task to Focus
            </span>
            <span className="text-xs text-text-muted font-mono">({incompleteTasks.length} available)</span>
          </div>
          {isChoosing && selectedTask && (
            <button
              type="button"
              onClick={() => setIsChoosing(false)}
              className="text-xs text-text-muted hover:text-text-primary cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="rounded-lg border border-border-subtle bg-bg-secondary/20 divide-y divide-border-subtle overflow-hidden max-h-56 overflow-y-auto">
          {incompleteTasks.slice(0, 6).map((task) => (
            <div
              key={task.id}
              onClick={() => {
                onSelectTask?.(task);
                setIsChoosing(false);
              }}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-bg-secondary/60 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="text-xs font-medium text-text-primary truncate">
                  {task.title}
                </span>
                {task.goalTitle && (
                  <span className="text-[10px] text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle truncate">
                    {task.goalTitle}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                <span className="text-xs font-mono text-text-muted">
                  {task.plannedDurationMinutes ?? 30}m
                </span>
                <PriorityBadge priority={task.priority} />
                <ChevronRight size={13} className="text-text-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 4. NO TASK AVAILABLE STATE
  return (
    <div
      className={`rounded-xl border border-border-subtle bg-bg-card p-6 space-y-3.5 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-text-muted">
          Current Focus
        </span>
      </div>

      <div className="space-y-1">
        <h3 className="text-base font-semibold text-text-primary">
          No tasks ready for focus
        </h3>
        <p className="text-xs text-text-muted leading-relaxed">
          Create or plan a task for today to begin an intentional focus block.
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {onAddTask && (
          <button
            type="button"
            onClick={onAddTask}
            className="inline-flex items-center gap-1.5 rounded-md bg-text-primary hover:opacity-90 text-bg-default text-xs font-medium px-3.5 py-1.5 transition-opacity cursor-pointer shadow-xs"
          >
            <Plus size={13} />
            <span>Add Task</span>
          </button>
        )}
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1.5 rounded-md bg-bg-secondary hover:bg-bg-tertiary border border-border-subtle text-text-primary text-xs font-medium px-3.5 py-1.5 transition-colors"
        >
          <ListTodo size={13} />
          <span>View Tasks</span>
        </Link>
      </div>
    </div>
  );
}
