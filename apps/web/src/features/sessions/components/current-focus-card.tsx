"use client";

import React, { useEffect, useState } from "react";
import {
  Play,
  Pause,
  CheckCircle2,
  ChevronRight,
  Target,
  Clock,
  Radio,
  Flame,
} from "lucide-react";
import type { Task } from "@repo/types";
import { PriorityBadge } from "@shared/components/primitives";
import { PlannedFocusPicker } from "@features/tasks";
import type { FocusTarget } from "../lib/focus-target";

export interface CurrentFocusCardProps {
  isActive?: boolean;
  isPaused?: boolean;
  isPending?: boolean;
  activeSessionTitle?: string | null;
  activeSessionGoalTitle?: string | null;
  activeSessionTargetMinutes?: number | null;
  activeSessionTaskId?: string | null;
  /** Explicit focus target chosen by the user. Null = nothing chosen yet (independent draft). */
  focusTarget?: FocusTarget | null;
  /** Authoritative task object for a task target, resolved from query data by the parent. */
  focusTask?: Task | null;
  availableTasks?: Task[];
  elapsedSeconds?: number;
  observedApplication?: string;
  observedDomain?: string;
  observedTitle?: string;
  onTargetChange?: (target: FocusTarget | null) => void;
  onStartFocus?: (target: FocusTarget, durationMinutes: number | null) => void;
  onPause?: () => void;
  onResume?: () => void;
  onComplete?: () => void;
  className?: string;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function CurrentFocusCard({
  isActive = false,
  isPaused = false,
  isPending = false,
  activeSessionTitle,
  activeSessionGoalTitle,
  activeSessionTargetMinutes,
  activeSessionTaskId,
  focusTarget = null,
  focusTask = null,
  availableTasks = [],
  elapsedSeconds = 0,
  observedApplication,
  observedDomain,
  observedTitle,
  onTargetChange,
  onStartFocus,
  onPause,
  onResume,
  onComplete,
  className = "",
}: CurrentFocusCardProps) {
  const [isChoosing, setIsChoosing] = useState(false);
  const [customTopic, setCustomTopic] = useState(
    focusTarget?.kind === "independent" ? focusTarget.topic : ""
  );
  const [selectedDuration, setSelectedDuration] = useState<number>(25);

  // Keep the session-target picker aligned with the chosen target: a task
  // target suggests the task's planned minutes; switching targets resets it.
  // This is a visible input default, never a hidden persisted fallback.
  const targetIdentity =
    focusTarget?.kind === "task" ? `task:${focusTarget.taskId}` : "independent";
  useEffect(() => {
    if (focusTarget?.kind === "task" && focusTask) {
      setSelectedDuration(focusTask.plannedDurationMinutes ?? 25);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIdentity]);

  const incompleteTasks = availableTasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  );

  // 1. ACTIVE OR PAUSED SESSION STATE (High-contrast, dominant operational timer)
  if (isActive || isPaused) {
    const title = activeSessionTitle ?? "Deliberate Focus Session";
    const goalTitle = activeSessionGoalTitle ?? null;
    const targetMins = activeSessionTargetMinutes ?? null;
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
              {!activeSessionTaskId && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted bg-bg-secondary border border-border-subtle px-1.5 py-0.5 rounded">
                  Independent
                </span>
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

  // Target chooser: explicit task vs independent choice. Cancel exists ONLY here.
  if (isChoosing) {
    return (
      <div
        className={`rounded-xl border border-border-subtle bg-bg-card p-5 sm:p-6 space-y-4 ${className}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-primary">
            Select focus target
          </span>
          <button
            type="button"
            onClick={() => setIsChoosing(false)}
            className="text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted px-1 pb-1">
            Tasks
          </div>
          {incompleteTasks.length === 0 ? (
            <p className="text-xs text-text-muted px-1 py-2">
              No uncompleted tasks. Create a task first, or start an independent block below.
            </p>
          ) : (
            <div className="rounded-lg border border-border-subtle bg-bg-secondary/20 divide-y divide-border-subtle overflow-hidden max-h-56 overflow-y-auto">
              {incompleteTasks.slice(0, 8).map((task) => {
                const isCurrent =
                  focusTarget?.kind === "task" && focusTarget.taskId === task.id;
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => {
                      onTargetChange?.({ kind: "task", taskId: task.id });
                      setIsChoosing(false);
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-bg-secondary/60 cursor-pointer transition-colors text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        className={`h-3.5 w-3.5 rounded-full border shrink-0 flex items-center justify-center ${
                          isCurrent ? "border-text-primary" : "border-border-strong"
                        }`}
                      >
                        {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-text-primary" />}
                      </span>
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
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-border-subtle">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted px-1 pb-1">
            Independent
          </div>
          <button
            type="button"
            onClick={() => {
              onTargetChange?.({ kind: "independent", topic: customTopic });
              setIsChoosing(false);
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-border-subtle bg-bg-secondary/20 hover:bg-bg-secondary/60 cursor-pointer transition-colors text-left"
          >
            <span className="text-xs font-medium text-text-primary">
              Start an independent focus block
            </span>
            <ChevronRight size={13} className="text-text-muted" />
          </button>
        </div>
      </div>
    );
  }

  // 2. TASK TARGET CHOSEN — ready to focus. No X: use "Switch task →".
  if (focusTarget?.kind === "task") {
    if (!focusTask) {
      return (
        <div
          className={`rounded-xl border border-border-subtle bg-bg-card p-6 space-y-3 ${className}`}
        >
          <p className="text-xs text-text-muted">
            The linked task is no longer available. Choose another target to continue.
          </p>
          <button
            type="button"
            onClick={() => setIsChoosing(true)}
            className="inline-flex items-center gap-1 text-xs text-text-primary hover:underline cursor-pointer"
          >
            <span>Select focus target</span>
            <ChevronRight size={13} />
          </button>
        </div>
      );
    }

    const planned = focusTask.plannedDurationMinutes ?? 30;

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
            className="inline-flex items-center gap-0.5 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <span>Switch task</span>
            <ChevronRight size={13} />
          </button>
        </div>

        <div className="space-y-1.5">
          <h2 className="text-lg sm:text-xl font-semibold text-text-primary tracking-tight">
            {focusTask.title}
          </h2>
          <div className="flex items-center gap-3 text-xs text-text-muted flex-wrap">
            {focusTask.goalTitle ? (
              <span className="flex items-center gap-1 text-text-secondary">
                <Target size={12} className="text-text-muted" />
                <span>Goal: {focusTask.goalTitle}</span>
              </span>
            ) : (
              <span>Independent Task</span>
            )}
            <span>·</span>
            <span className="flex items-center gap-1 font-mono">
              <Clock size={11} />
              <span>Task planned: {planned}m</span>
            </span>
            <PriorityBadge priority={focusTask.priority} />
          </div>
        </div>

        <div className="pt-3 border-t border-border-subtle flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-text-muted flex items-center gap-2">
            Session target:
            <PlannedFocusPicker
              value={selectedDuration}
              onChange={setSelectedDuration}
              disabled={isPending}
            />
          </span>
          <button
            type="button"
            onClick={() => onStartFocus?.(focusTarget, selectedDuration)}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-text-primary hover:opacity-90 text-bg-default text-xs font-medium px-4 py-2 transition-opacity cursor-pointer shadow-xs"
          >
            <Play size={11} className="fill-current" />
            <span>Start Focus ({selectedDuration}m)</span>
          </button>
        </div>
      </div>
    );
  }

  // 3. INDEPENDENT FOCUS (default when nothing is chosen)
  return (
    <div
      className={`rounded-xl border border-border-subtle bg-bg-card p-5 sm:p-6 space-y-4 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-text-muted" />
          <span className="text-xs font-medium text-text-muted">
            Independent Focus
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsChoosing(true)}
          className="inline-flex items-center gap-0.5 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        >
          <span>Choose a task instead</span>
          <ChevronRight size={13} />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <input
          type="text"
          value={customTopic}
          onChange={(e) => {
            setCustomTopic(e.target.value);
            onTargetChange?.({ kind: "independent", topic: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && customTopic.trim()) {
              onStartFocus?.(
                { kind: "independent", topic: customTopic },
                selectedDuration
              );
            }
          }}
          placeholder="What are you focusing on? (e.g. Code review, Deep study)"
          className="flex-1 bg-bg-secondary/60 border border-border-subtle focus:border-border-strong text-text-primary placeholder:text-text-muted px-3.5 py-2 rounded-md text-xs outline-none transition-colors"
        />
        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
          <PlannedFocusPicker
            value={selectedDuration}
            onChange={setSelectedDuration}
            disabled={isPending}
          />
          <button
            type="button"
            onClick={() => {
              onStartFocus?.(
                { kind: "independent", topic: customTopic },
                selectedDuration
              );
            }}
            disabled={isPending || !customTopic.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-text-primary hover:opacity-90 text-bg-default text-xs font-medium px-4 py-2 transition-opacity cursor-pointer shadow-xs shrink-0 disabled:opacity-40"
          >
            <Play size={11} className="fill-current" />
            <span>Start Focus</span>
          </button>
        </div>
      </div>
      <p className="text-[11px] text-text-muted">
        Not linked to any task. It will appear in history as an independent block.
      </p>
    </div>
  );
}
