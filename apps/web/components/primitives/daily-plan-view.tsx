"use client";

import React, { useState } from "react";
import {
  Target,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Edit3,
  CheckCircle2,
  Circle,
  Sparkles,
  Info,
  Clock,
  ArrowRight,
} from "lucide-react";
import type { DailyGoal, GoalOutcome, Task } from "@repo/types";
import { formatProductiveDateLabel } from "@repo/types";
import { OutcomeBadge, PriorityBadge } from "./data-badge";

export interface DailyPlanViewProps {
  date: string;
  hasPlan: boolean;
  goals: DailyGoal[];
  independentTasks?: Task[];
  isLoading?: boolean;
  onSavePlan: (goals: Array<{ id?: string; title: string; order: number; outcome?: GoalOutcome | null }>) => Promise<void> | void;
  onAssessOutcome?: (goalId: string, outcome: GoalOutcome) => Promise<void> | void;
  onToggleTask?: (task: Task) => Promise<void> | void;
  className?: string;
}

export function DailyPlanView({
  date,
  hasPlan,
  goals,
  independentTasks = [],
  isLoading = false,
  onSavePlan,
  onAssessOutcome,
  onToggleTask,
  className = "",
}: DailyPlanViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});
  const [draftGoals, setDraftGoals] = useState<Array<{ id?: string; title: string }>>([]);

  const formattedDate = date ? formatProductiveDateLabel(date) : "";

  const toggleExpand = (goalId: string) => {
    setExpandedGoals((prev) => ({ ...prev, [goalId]: !prev[goalId] }));
  };

  const startEditing = () => {
    setDraftGoals(
      goals.length > 0
        ? goals.map((g) => ({ id: g.id, title: g.title }))
        : [{ title: "" }]
    );
    setIsEditing(true);
  };

  const addDraftGoal = () => {
    setDraftGoals((prev) => [...prev, { title: "" }]);
  };

  const updateDraftGoal = (index: number, title: string) => {
    setDraftGoals((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], title };
      return next;
    });
  };

  const removeDraftGoal = (index: number) => {
    setDraftGoals((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const cleaned = draftGoals
      .filter((g) => g.title.trim().length > 0)
      .map((g, idx) => ({ id: g.id, title: g.title.trim(), order: idx }));
    await onSavePlan(cleaned);
    setIsEditing(false);
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-5 sm:p-6 space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-20 bg-white/5 rounded animate-pulse" />
        </div>
        <div className="h-6 w-3/4 bg-white/5 rounded animate-pulse" />
        <div className="h-10 w-full bg-white/5 rounded animate-pulse" />
      </div>
    );
  }

  // 1. EDITABLE STATE
  if (isEditing) {
    return (
      <div className={`rounded-lg border border-indigo-500/40 bg-[var(--background-card)] p-5 sm:p-6 space-y-4 ${className}`}>
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
            <Edit3 size={13} />
            <span>EDIT DAILY PLAN</span>
          </span>
          {formattedDate && (
            <span className="text-xs text-[var(--foreground-muted)] font-mono">{formattedDate}</span>
          )}
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-[var(--foreground-primary)]">
                Daily Goals (0..N objectives)
              </label>
              <span className="text-[11px] text-[var(--foreground-muted)]">
                1–3 recommended for focus
              </span>
            </div>

            {draftGoals.map((g, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="font-mono text-xs text-[var(--foreground-muted)] w-6 shrink-0 text-center bg-white/5 py-1 rounded">
                  {(idx + 1).toString().padStart(2, "0")}
                </span>
                <input
                  type="text"
                  value={g.title}
                  onChange={(e) => updateDraftGoal(idx, e.target.value)}
                  placeholder={`Goal ${idx + 1} (e.g. Learn React Query, Improve ProductiveHix)`}
                  className="flex-1 text-xs sm:text-sm bg-[var(--background-subtle)] border border-[var(--border-subtle)] rounded-md px-3 py-2 text-[var(--foreground-primary)] placeholder:text-[var(--foreground-muted)] focus-visible:outline-none focus-visible:border-[var(--foreground-primary)]"
                  autoFocus={idx === draftGoals.length - 1}
                />
                {draftGoals.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDraftGoal(idx)}
                    className="p-1.5 text-[var(--foreground-muted)] hover:text-rose-400 transition-colors"
                    title="Remove goal"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={addDraftGoal}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 py-1"
            >
              <Plus size={13} />
              <span>Add another goal</span>
            </button>

            {draftGoals.length > 3 && (
              <span className="text-[11px] text-amber-400/90 flex items-center gap-1">
                <Info size={12} />
                <span>Many goals set. Guidance recommends 1–3 for focused days.</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] px-3 py-1.5 rounded-md hover:bg-[var(--background-subtle)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="text-xs font-medium bg-[var(--foreground-primary)] text-[var(--background-primary)] hover:opacity-90 px-4 py-2 rounded-md transition-opacity"
          >
            Save Plan
          </button>
        </div>
      </div>
    );
  }

  // 2. UNPLANNED STATE
  if (!hasPlan && goals.length === 0) {
    return (
      <div className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-5 sm:p-6 space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
            DAILY PLAN
          </span>
          {formattedDate && (
            <span className="text-xs text-[var(--foreground-muted)] font-mono">{formattedDate}</span>
          )}
        </div>

        <div className="space-y-1 max-w-lg">
          <h2 className="text-base sm:text-lg font-semibold text-[var(--foreground-primary)] tracking-tight">
            Your day hasn&apos;t been planned yet
          </h2>
          <p className="text-xs sm:text-sm text-[var(--foreground-muted)] leading-relaxed">
            What are your material objectives for today? Take 30 seconds to define 1–3 Daily Goals.
          </p>
        </div>

        <button
          type="button"
          onClick={startEditing}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--foreground-primary)] hover:opacity-90 text-[var(--background-primary)] text-xs font-semibold px-4 py-2 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground-primary)]"
        >
          <Target size={14} />
          <span>Plan Today</span>
          <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  // 3. PLANNED STATE (Normal View with progressive disclosure)
  return (
    <div className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-5 sm:p-6 space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
            TODAY&apos;S PLAN
          </span>
          <span className="text-xs font-medium text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
            {goals.length} {goals.length === 1 ? "Goal" : "Goals"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {formattedDate && (
            <span className="text-xs text-[var(--foreground-muted)] font-mono">{formattedDate}</span>
          )}
          {onAssessOutcome && (
            <button
              type="button"
              onClick={() => setIsAssessing(!isAssessing)}
              className={`text-xs flex items-center gap-1 transition-colors px-2.5 py-1 rounded-md border ${
                isAssessing
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                  : "border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] hover:bg-[var(--background-subtle)]"
              }`}
            >
              <CheckCircle2 size={12} />
              <span>{isAssessing ? "Done Assessing" : "Assess Outcomes"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={startEditing}
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] flex items-center gap-1 transition-colors hover:bg-[var(--background-subtle)] px-2 py-1 rounded-md"
          >
            <Edit3 size={12} />
            <span>Edit Plan</span>
          </button>
        </div>
      </div>

      {/* Gentle guidance warning if > 3 goals */}
      {goals.length > 3 && (
        <div className="flex items-center gap-2 text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-md">
          <Info size={13} className="shrink-0" />
          <span>You have {goals.length} goals today. Recommended 1–3 for maximum focus, but all are supported.</span>
        </div>
      )}

      {/* 0..N Goals with Progressive Disclosure */}
      <div className="space-y-2.5">
        {goals.map((goal, idx) => {
          const tasks = goal.tasks ?? [];
          const isExpanded = expandedGoals[goal.id] ?? true; // Default expanded for good visibility
          const estMinutes = tasks.reduce((sum, t) => sum + (t.plannedDurationMinutes ?? 0), 0);
          const estHours = Math.floor(estMinutes / 60);
          const estMins = estMinutes % 60;
          const estString =
            estMinutes > 0
              ? estHours > 0
                ? `${estHours}h ${estMins}m`
                : `${estMins}m`
              : null;

          return (
            <div
              key={goal.id}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--background-subtle)] overflow-hidden transition-colors hover:border-[var(--border-hover)]"
            >
              {/* Goal Header Row */}
              <div
                className="flex items-center justify-between p-3 cursor-pointer select-none"
                onClick={() => toggleExpand(goal.id)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded shrink-0">
                    {(idx + 1).toString().padStart(2, "0")}
                  </span>
                  <span className="text-sm font-semibold text-[var(--foreground-primary)] truncate">
                    {goal.title}
                  </span>
                  <span className="text-xs text-[var(--foreground-muted)] shrink-0">
                    ({tasks.length} {tasks.length === 1 ? "task" : "tasks"}
                    {estString ? ` · ${estString}` : ""})
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {goal.outcome && <OutcomeBadge outcome={goal.outcome} />}
                  <button
                    type="button"
                    className="text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] p-0.5"
                    aria-label={isExpanded ? "Collapse goal" : "Expand goal"}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>
              </div>

              {/* Collapsible Nested Tasks */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-1.5">
                  {tasks.length > 0 ? (
                    tasks.map((task, taskIdx) => {
                      const isDone = task.status === "done";
                      return (
                        <div
                          key={task.id}
                          className="group flex items-center justify-between text-xs py-1.5 px-2 rounded bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-[var(--foreground-muted)] font-mono text-[10px] shrink-0">
                              {taskIdx === tasks.length - 1 ? "└──" : "├──"}
                            </span>
                            {onToggleTask && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleTask(task);
                                }}
                                aria-label={isDone ? `Mark incomplete: ${task.title}` : `Mark complete: ${task.title}`}
                                className="text-[var(--foreground-muted)] hover:text-emerald-400 transition-colors shrink-0 p-0.5 cursor-pointer"
                              >
                                {isDone ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-emerald-500/20" />
                                ) : (
                                  <Circle className="w-3.5 h-3.5 hover:text-white" />
                                )}
                              </button>
                            )}
                            <span
                              className={`truncate transition-colors ${
                                isDone
                                  ? "text-[var(--foreground-muted)] opacity-70"
                                  : "text-[var(--foreground-primary)]"
                              }`}
                            >
                              {task.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {task.plannedDurationMinutes && (
                              <span className={`text-[11px] text-[var(--foreground-muted)] flex items-center gap-0.5 ${isDone ? "opacity-50" : ""}`}>
                                <Clock size={10} />
                                {task.plannedDurationMinutes}m
                              </span>
                            )}
                            <div className={isDone ? "opacity-50" : ""}>
                              <PriorityBadge priority={task.priority} />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-[11px] text-[var(--foreground-muted)] py-1 pl-4 italic">
                      No tasks linked to this goal yet.
                    </div>
                  )}

                  {/* Outcome assessment inline picker */}
                  {isAssessing && (
                    <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-[var(--foreground-muted)]">Assess outcome:</span>
                      {(["ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED", "NOT_ASSESSED"] as const).map(
                        (outcome) => (
                          <button
                            key={outcome}
                            type="button"
                            onClick={() => onAssessOutcome?.(goal.id, outcome)}
                            className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                              goal.outcome === outcome
                                ? "border-indigo-400 bg-indigo-500/20 text-white font-medium"
                                : "border-white/10 text-[var(--foreground-muted)] hover:text-white hover:border-white/20"
                            }`}
                          >
                            {outcome.replace("_", " ")}
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Independent Tasks Section if any exist for today */}
      {independentTasks.length > 0 && (
        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
              OTHER TODAY (INDEPENDENT TASKS)
            </span>
            <span className="text-[var(--foreground-muted)]">
              {independentTasks.length} {independentTasks.length === 1 ? "task" : "tasks"}
            </span>
          </div>
          <div className="space-y-1">
            {independentTasks.map((task, idx) => {
              const isDone = task.status === "done";
              return (
                <div
                  key={task.id}
                  className="group flex items-center justify-between text-xs py-1.5 px-2 rounded bg-[var(--background-subtle)] hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[var(--foreground-muted)] font-mono text-[10px] shrink-0">
                      {idx === independentTasks.length - 1 ? "└──" : "├──"}
                    </span>
                    {onToggleTask && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleTask(task);
                        }}
                        aria-label={isDone ? `Mark incomplete: ${task.title}` : `Mark complete: ${task.title}`}
                        className="text-[var(--foreground-muted)] hover:text-emerald-400 transition-colors shrink-0 p-0.5 cursor-pointer"
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 fill-emerald-500/20" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 hover:text-white" />
                        )}
                      </button>
                    )}
                    <span
                      className={`truncate transition-colors ${
                        isDone
                          ? "text-[var(--foreground-muted)] opacity-70"
                          : "text-[var(--foreground-primary)]"
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {task.plannedDurationMinutes && (
                      <span className={`text-[11px] text-[var(--foreground-muted)] flex items-center gap-0.5 ${isDone ? "opacity-50" : ""}`}>
                        <Clock size={10} />
                        {task.plannedDurationMinutes}m
                      </span>
                    )}
                    <div className={isDone ? "opacity-50" : ""}>
                      <PriorityBadge priority={task.priority} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
