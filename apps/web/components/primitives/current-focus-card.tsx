"use client";

import React, { useState } from "react";
import {
  Play,
  Pause,
  CheckCircle2,
  ListTodo,
  Plus,
  ExternalLink,
  Target,
  Clock,
  Radio,
  RotateCcw,
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

  // 1. ACTIVE SESSION STATE (Active execution with contextual observed telemetry)
  if (isActive && selectedTask) {
    const observedContext = observedDomain
      ? `${observedApplication || "Browser"} · ${observedDomain}`
      : observedTitle
      ? `${observedApplication || "Desktop"} · ${observedTitle}`
      : observedApplication;

    return (
      <div
        className={`rounded-lg border border-indigo-500/40 bg-[var(--background-card)] p-5 space-y-4 ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              ACTIVE SESSION
            </span>
          </div>
          <div className="text-sm font-mono text-[var(--foreground-muted)]">
            <span className="text-[var(--foreground-primary)] font-semibold text-base">
              {formatElapsed(elapsedSeconds)}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl font-bold text-[var(--foreground-primary)] tracking-tight">
            {selectedTask.title}
          </h2>
          {selectedTask.goalTitle && (
            <div className="flex items-center gap-1 text-xs text-indigo-400">
              <Target size={12} />
              <span>Goal: {selectedTask.goalTitle}</span>
            </div>
          )}
        </div>

        {/* Contextual Observed Telemetry */}
        {observedContext && (
          <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] bg-[var(--background-subtle)] border border-[var(--border-subtle)] px-3 py-1.5 rounded-md">
            <Radio size={12} className="text-indigo-400 shrink-0" />
            <span className="truncate">
              Observed: <strong className="text-[var(--foreground-primary)] font-medium">{observedContext}</strong>
            </span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
          {onPause && (
            <button
              type="button"
              onClick={onPause}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] bg-[var(--background-subtle)] border border-[var(--border-subtle)] hover:bg-white/[0.04] px-3 py-1.5 rounded-md transition-colors"
            >
              <Pause size={12} />
              <span>Pause</span>
            </button>
          )}
          {onComplete && (
            <button
              type="button"
              onClick={onComplete}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-1.5 rounded-md transition-colors"
            >
              <CheckCircle2 size={13} />
              <span>Complete Focus</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // 2. TASK SELECTED, READY TO START FOCUS
  if (selectedTask) {
    return (
      <div
        className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-5 space-y-4 ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
              CURRENT FOCUS
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsChoosing(true)}
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] transition-colors"
          >
            Switch Task
          </button>
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base sm:text-lg font-bold text-[var(--foreground-primary)]">
            {selectedTask.title}
          </h2>
          <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)]">
            {selectedTask.goalTitle ? (
              <span className="flex items-center gap-1 text-indigo-400">
                <Target size={12} />
                <span>Goal: {selectedTask.goalTitle}</span>
              </span>
            ) : (
              <span>Independent Task</span>
            )}
            <span className="flex items-center gap-1">
              <Clock size={12} />
              <span>Estimate: {selectedTask.plannedDurationMinutes ?? 30}m</span>
            </span>
            <PriorityBadge priority={selectedTask.priority} />
          </div>
        </div>

        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <span className="text-xs text-[var(--foreground-muted)]">
            Ready to begin intentional execution
          </span>
          <button
            type="button"
            onClick={onStartFocus}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--foreground-primary)] hover:opacity-90 text-[var(--background-primary)] text-xs font-semibold px-4 py-2 transition-opacity"
          >
            <Play size={13} className="fill-current" />
            <span>Start Focus</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. COMPACT TASK CHOOSER (Tasks available, choose one to focus)
  const incompleteTasks = availableTasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  );

  if (incompleteTasks.length > 0) {
    return (
      <div
        className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-5 space-y-3 ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
              CURRENT FOCUS
            </span>
            <span className="text-xs text-[var(--foreground-muted)]">· Select task to focus</span>
          </div>
          {onAddTask && (
            <button
              type="button"
              onClick={onAddTask}
              className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
            >
              <Plus size={12} />
              <span>Add Task</span>
            </button>
          )}
        </div>

        <p className="text-xs text-[var(--foreground-muted)]">
          Choose a task from today&apos;s work to begin an intentional session:
        </p>

        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {incompleteTasks.slice(0, 5).map((task) => (
            <div
              key={task.id}
              onClick={() => onSelectTask?.(task)}
              className="flex items-center justify-between p-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--background-subtle)] hover:border-indigo-400/50 hover:bg-white/[0.04] cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-medium text-[var(--foreground-primary)] truncate">
                  {task.title}
                </span>
                {task.goalTitle && (
                  <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded truncate">
                    {task.goalTitle}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-[var(--foreground-muted)]">
                  {task.plannedDurationMinutes ?? 30}m
                </span>
                <PriorityBadge priority={task.priority} />
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
      className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-5 space-y-3 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
          CURRENT FOCUS
        </span>
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[var(--foreground-primary)]">
          Nothing ready to focus on.
        </h3>
        <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
          Create or select a task to begin an intentional focus session.
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {onAddTask && (
          <button
            type="button"
            onClick={onAddTask}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--foreground-primary)] hover:opacity-90 text-[var(--background-primary)] text-xs font-medium px-3.5 py-1.5 transition-opacity"
          >
            <Plus size={13} />
            <span>Add Task</span>
          </button>
        )}
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--background-subtle)] hover:bg-white/[0.04] border border-[var(--border-subtle)] text-[var(--foreground-primary)] text-xs font-medium px-3 py-1.5 transition-colors"
        >
          <ListTodo size={13} />
          <span>View Tasks</span>
        </Link>
      </div>
    </div>
  );
}
