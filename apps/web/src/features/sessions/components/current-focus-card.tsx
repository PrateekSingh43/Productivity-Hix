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
  ChevronRight,
  Flame,
  X,
} from "lucide-react";
import type { Task } from "@repo/types";
import { PriorityBadge } from "@shared/components/primitives";
import Link from "next/link";

export interface CurrentFocusCardProps {
  isActive?: boolean;
  isPaused?: boolean;
  isPending?: boolean;
  activeSessionTitle?: string | null;
  activeSessionGoalTitle?: string | null;
  activeSessionTargetMinutes?: number | null;
  selectedTask?: Task | null;
  availableTasks?: Task[];
  elapsedSeconds?: number;
  observedApplication?: string;
  observedDomain?: string;
  observedTitle?: string;
  onSelectTask?: (task: Task | null) => void;
  onStartFocus?: (params?: { taskId?: string | null; notes?: string | null; durationMinutes?: number | null }) => void;
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

const DURATION_PRESETS = [15, 25, 45, 60, 90];

export function CurrentFocusCard({
  isActive = false,
  isPaused = false,
  isPending = false,
  activeSessionTitle,
  activeSessionGoalTitle,
  activeSessionTargetMinutes,
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
  const [customTopic, setCustomTopic] = useState("");
  const [selectedDuration, setSelectedDuration] = useState<number>(25);

  // 1. ACTIVE OR PAUSED SESSION STATE (High-contrast, dominant operational timer)
  if (isActive || isPaused) {
    const title = selectedTask?.title ?? activeSessionTitle ?? "Deliberate Focus Session";
    const goalTitle = selectedTask?.goalTitle ?? activeSessionGoalTitle ?? null;
    const targetMins = activeSessionTargetMinutes ?? selectedTask?.plannedDurationMinutes ?? null;
    const targetSeconds = targetMins ? targetMins * 60 : 0;
    const isOvertime = targetSeconds > 0 && elapsedSeconds > targetSeconds;
    const overtimeMins = isOvertime ? Math.floor((elapsedSeconds - targetSeconds) / 60) : 0;
    const progressPercent = targetSeconds > 0
      ? Math.min(100, Math.round((elapsedSeconds / targetSeconds) * 100))
      : 0;

    const observedContext = observedDomain
      ? `${observedApplication || "Browser"} · ${observedDomain}`
      : observedTitle
      ? `${observedApplication || "Desktop"} · ${observedTitle}`
      : observedApplication;

    return (
      <div
        className={`rounded-xl border border-border-strong bg-bg-card p-6 sm:p-7 space-y-5 ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-text-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-text-primary" />
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-text-primary">
                {isPaused ? "Focus Session Paused" : "Focus Session Active"}
              </span>
              {goalTitle && (
                <>
                  <span className="text-text-muted text-xs">·</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary bg-bg-secondary border border-border-subtle px-2 py-0.5 rounded">
                    <Target size={11} className="text-text-muted" />
                    <span>{goalTitle}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end sm:items-end gap-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-mono text-text-muted">Elapsed</span>
              <span className="text-3xl sm:text-4xl font-semibold font-mono tabular-nums text-text-primary">
                {formatElapsed(elapsedSeconds)}
              </span>
            </div>
            {targetMins && (
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-text-muted">Target: {targetMins}m</span>
                {isOvertime && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-bg-secondary text-text-primary border border-border-strong">
                    <Flame size={10} />
                    <span>+{overtimeMins}m Flow Overtime</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Progress benchmark bar */}
        {targetSeconds > 0 && (
          <div className="w-full bg-bg-secondary h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-text-primary h-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        <div className="space-y-1">
          <h2 className="text-xl sm:text-2xl font-semibold text-text-primary tracking-tight">
            {title}
          </h2>
          {selectedTask?.description && (
            <p className="text-xs sm:text-sm text-text-muted leading-relaxed max-w-2xl">
              {selectedTask.description}
            </p>
          )}
        </div>

        {/* Realtime Observed Telemetry */}
        {observedContext && (
          <div className="flex items-center gap-2 text-xs text-text-secondary bg-bg-secondary/60 border border-border-subtle px-3.5 py-2 rounded-lg">
            <Radio size={12} className="text-text-primary shrink-0 animate-pulse" />
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
              onClick={isPaused ? onResume : onPause}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary bg-bg-secondary border border-border-subtle hover:border-border-hover px-3.5 py-2 rounded-md transition-colors cursor-pointer"
            >
              {isPaused ? <Play size={12} /> : <Pause size={12} />}
              <span>{isPaused ? "Resume" : "Pause"}</span>
            </button>
          )}
          {onComplete && (
            <button
              type="button"
              onClick={onComplete}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-text-primary hover:opacity-90 text-bg-default px-4 py-2 rounded-md transition-colors cursor-pointer"
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
  if (selectedTask && !isChoosing) {
    const planned = selectedTask.plannedDurationMinutes ?? 30;

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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsChoosing(true)}
              className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            >
              Switch Task
            </button>
            <button
              type="button"
              onClick={() => onSelectTask?.(null)}
              className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              title="Clear selection"
            >
              <X size={12} />
            </button>
          </div>
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
              <span>Planned: {planned}m</span>
            </span>
            <PriorityBadge priority={selectedTask.priority} />
          </div>
        </div>

        <div className="pt-3 border-t border-border-subtle flex items-center justify-between gap-3">
          <span className="text-xs text-text-muted">
            Deliberate focus session linked to task
          </span>
          <button
            type="button"
            onClick={() => onStartFocus?.({ taskId: selectedTask.id, durationMinutes: planned })}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-text-primary hover:opacity-90 text-bg-default text-xs font-medium px-4 py-2 transition-opacity cursor-pointer shadow-xs"
          >
            <Play size={11} className="fill-current" />
            <span>Start Focus ({planned}m)</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. TASK CHOOSER & QUICK INTENTION LAUNCHPAD
  const incompleteTasks = availableTasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  );

  return (
    <div
      className={`rounded-xl border border-border-subtle bg-bg-card p-5 sm:p-6 space-y-4 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-text-muted" />
          <span className="text-xs font-medium text-text-muted">
            Start Deliberate Focus Block
          </span>
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

      {/* Ad-Hoc Focus Topic Input & Duration Selector */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (customTopic.trim() || selectedTask)) {
                onStartFocus?.({
                  taskId: selectedTask?.id ?? null,
                  notes: customTopic.trim() || undefined,
                  durationMinutes: selectedDuration,
                });
              }
            }}
            placeholder="What are you focusing on right now? (e.g. Code review, Deep study)"
            className="flex-1 bg-bg-secondary/60 border border-border-subtle focus:border-border-strong text-text-primary placeholder:text-text-muted px-3.5 py-2 rounded-md text-xs outline-none transition-colors"
          />
          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            {DURATION_PRESETS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setSelectedDuration(mins)}
                className={`px-2.5 py-1.5 rounded text-xs font-mono transition-colors cursor-pointer ${
                  selectedDuration === mins
                    ? "bg-text-primary text-bg-default font-medium"
                    : "bg-bg-secondary text-text-muted hover:text-text-primary border border-border-subtle"
                }`}
              >
                {mins}m
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onStartFocus?.({
                  taskId: selectedTask?.id ?? null,
                  notes: customTopic.trim() || (selectedTask ? `Focus on ${selectedTask.title}` : "Deliberate focus session"),
                  durationMinutes: selectedDuration,
                });
              }}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-text-primary hover:opacity-90 text-bg-default text-xs font-medium px-4 py-2 transition-opacity cursor-pointer shadow-xs shrink-0"
            >
              <Play size={11} className="fill-current" />
              <span>Start Focus</span>
            </button>
          </div>
        </div>
      </div>

      {/* Available Tasks List */}
      {incompleteTasks.length > 0 ? (
        <div className="space-y-2 pt-2 border-t border-border-subtle">
          <div className="flex items-center justify-between text-[11px] text-text-muted">
            <span>Or select an existing task to link:</span>
            <span className="font-mono">{incompleteTasks.length} available</span>
          </div>
          <div className="rounded-lg border border-border-subtle bg-bg-secondary/20 divide-y divide-border-subtle overflow-hidden max-h-48 overflow-y-auto">
            {incompleteTasks.slice(0, 6).map((task) => (
              <div
                key={task.id}
                onClick={() => {
                  onSelectTask?.(task);
                  setIsChoosing(false);
                }}
                className="flex items-center justify-between px-3.5 py-2 hover:bg-bg-secondary/60 cursor-pointer transition-colors"
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
      ) : (
        <div className="pt-2 border-t border-border-subtle flex items-center justify-between text-xs text-text-muted">
          <span>No uncompleted tasks found. Start ad-hoc focus above or create a task.</span>
          {onAddTask && (
            <button
              type="button"
              onClick={onAddTask}
              className="inline-flex items-center gap-1 text-xs text-text-primary hover:underline cursor-pointer"
            >
              <Plus size={11} />
              <span>Add Task</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
