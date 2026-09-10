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
  Clock,
  ArrowRight,
  Info,
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

  // 1. LOADING SKELETON
  if (isLoading) {
    return (
      <div className={`rounded-xl border border-border-subtle bg-bg-card p-5 sm:p-6 space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 bg-bg-secondary rounded animate-pulse" />
          <div className="h-4 w-20 bg-bg-secondary rounded animate-pulse" />
        </div>
        <div className="h-6 w-3/4 bg-bg-secondary rounded animate-pulse" />
        <div className="h-10 w-full bg-bg-secondary rounded animate-pulse" />
      </div>
    );
  }

  // 2. EDITABLE STATE
  if (isEditing) {
    return (
      <div className={`rounded-xl border border-border-hover bg-bg-card p-5 sm:p-6 space-y-4 ${className}`}>
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2">
            <Edit3 size={14} className="text-text-muted" />
            <span className="text-sm font-semibold text-text-primary tracking-tight">
              Edit Daily Plan
            </span>
          </div>
          {formattedDate && (
            <span className="text-xs text-text-muted font-mono">{formattedDate}</span>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">
              Daily Objectives (1–3 recommended)
            </span>
            <span className="text-[11px] text-text-muted">
              Primary intentional outcomes for today
            </span>
          </div>

          <div className="space-y-2">
            {draftGoals.map((g, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="font-mono text-xs text-text-muted w-7 shrink-0 text-center py-1.5 rounded bg-bg-secondary border border-border-subtle">
                  {(idx + 1).toString().padStart(2, "0")}
                </span>
                <input
                  type="text"
                  value={g.title}
                  onChange={(e) => updateDraftGoal(idx, e.target.value)}
                  placeholder={`Objective ${idx + 1} (e.g. Ship v2 Auth, Prepare Q3 review)`}
                  className="flex-1 text-sm bg-bg-secondary border border-border-subtle rounded-md px-3 py-2 text-text-primary placeholder:text-text-muted focus-visible:outline-none focus-visible:border-border-hover"
                  autoFocus={idx === draftGoals.length - 1}
                />
                {draftGoals.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDraftGoal(idx)}
                    className="p-2 text-text-muted hover:text-rose-500 rounded hover:bg-bg-secondary transition-colors"
                    title="Remove objective"
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
              className="inline-flex items-center gap-1.5 text-xs font-medium text-text-primary hover:text-text-secondary py-1 cursor-pointer transition-colors"
            >
              <Plus size={13} />
              <span>Add another objective</span>
            </button>

            {draftGoals.length > 3 && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Info size={12} />
                <span>Notice: More than 3 goals can dilute focus.</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle">
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="text-xs text-text-muted hover:text-text-primary px-3 py-1.5 rounded-md hover:bg-bg-secondary transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="text-xs font-medium bg-text-primary text-bg-default hover:opacity-90 px-4 py-2 rounded-md transition-opacity cursor-pointer shadow-xs"
          >
            Save Plan
          </button>
        </div>
      </div>
    );
  }

  // 3. UNPLANNED STATE
  if (!hasPlan && goals.length === 0) {
    return (
      <div className={`rounded-xl border border-border-subtle bg-bg-card p-6 sm:p-7 space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-muted">
            Daily Plan
          </span>
          {formattedDate && (
            <span className="text-xs text-text-muted font-mono">{formattedDate}</span>
          )}
        </div>

        <div className="space-y-1.5 max-w-lg">
          <h2 className="text-lg font-semibold text-text-primary tracking-tight">
            Today is not yet planned
          </h2>
          <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
            Set 1–3 material objectives to anchor your focus blocks and measure intention against reality.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-2 rounded-md bg-text-primary hover:opacity-90 text-bg-default text-xs font-semibold px-4 py-2 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-hover cursor-pointer shadow-xs"
          >
            <Target size={14} />
            <span>Plan Today</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    );
  }

  // 4. PLANNED STATE (Structured container with hairline dividers, zero card-in-card)
  return (
    <div className={`rounded-xl border border-border-subtle bg-bg-card overflow-hidden ${className}`}>
      {/* Header Bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold tracking-tight text-text-primary">
            Today&apos;s Plan
          </h2>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-bg-secondary text-text-secondary border border-border-subtle">
            {goals.length} {goals.length === 1 ? "Goal" : "Goals"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {formattedDate && (
            <span className="text-xs text-text-muted font-mono mr-2 hidden sm:inline">
              {formattedDate}
            </span>
          )}
          {onAssessOutcome && (
            <button
              type="button"
              onClick={() => setIsAssessing(!isAssessing)}
              className={`text-xs flex items-center gap-1.5 transition-colors px-2.5 py-1.5 rounded-md border cursor-pointer ${
                isAssessing
                  ? "border-border-hover bg-bg-secondary text-text-primary font-medium"
                  : "border-border-subtle text-text-muted hover:text-text-primary hover:bg-bg-secondary"
              }`}
            >
              <CheckCircle2 size={13} />
              <span>{isAssessing ? "Done Assessing" : "Assess Outcomes"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={startEditing}
            className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1.5 transition-colors hover:bg-bg-secondary px-2.5 py-1.5 rounded-md border border-border-subtle cursor-pointer"
          >
            <Edit3 size={13} />
            <span>Edit</span>
          </button>
        </div>
      </div>

      {/* Guidance if > 3 goals */}
      {goals.length > 3 && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/5 px-5 py-2 border-b border-border-subtle">
          <Info size={13} className="shrink-0" />
          <span>You have {goals.length} goals today. 1–3 recommended for focused days.</span>
        </div>
      )}

      {/* Goals List (Unified container with hairline dividers) */}
      <div className="divide-y divide-border-subtle">
        {goals.map((goal, idx) => {
          const tasks = goal.tasks ?? [];
          const isExpanded = expandedGoals[goal.id] ?? true;
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
            <div key={goal.id} className="transition-colors">
              {/* Goal Header Row */}
              <div
                className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none hover:bg-bg-secondary/40 transition-colors"
                onClick={() => toggleExpand(goal.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs font-semibold text-text-secondary bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle shrink-0">
                    {(idx + 1).toString().padStart(2, "0")}
                  </span>
                  <span className="text-sm font-semibold text-text-primary truncate">
                    {goal.title}
                  </span>
                  <span className="text-xs text-text-muted font-mono shrink-0 hidden sm:inline">
                    {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
                    {estString ? ` · ${estString}` : ""}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {goal.outcome && <OutcomeBadge outcome={goal.outcome} />}
                  <button
                    type="button"
                    className="text-text-muted hover:text-text-primary p-0.5 transition-colors"
                    aria-label={isExpanded ? "Collapse goal" : "Expand goal"}
                  >
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                </div>
              </div>

              {/* Collapsible Nested Tasks (Subtle hairline list, NOT nested cards) */}
              {isExpanded && (
                <div className="bg-bg-secondary/20 border-t border-border-subtle/50">
                  {tasks.length > 0 ? (
                    <div className="divide-y divide-border-subtle/30">
                      {tasks.map((task) => {
                        const isDone = task.status === "done";
                        return (
                          <div
                            key={task.id}
                            className="group flex items-center justify-between py-2 px-5 pl-12 hover:bg-bg-secondary/50 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {onToggleTask && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleTask(task);
                                  }}
                                  aria-label={isDone ? `Mark incomplete: ${task.title}` : `Mark complete: ${task.title}`}
                                  className="text-text-muted hover:text-emerald-500 transition-colors shrink-0 p-0.5 cursor-pointer"
                                >
                                  {isDone ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/20" />
                                  ) : (
                                    <Circle className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                              <span
                                className={`text-xs truncate transition-colors ${
                                  isDone
                                    ? "text-text-muted line-through opacity-70"
                                    : "text-text-primary"
                                }`}
                              >
                                {task.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0 ml-3">
                              {task.plannedDurationMinutes && (
                                <span className={`text-[11px] font-mono text-text-muted flex items-center gap-1 ${isDone ? "opacity-50" : ""}`}>
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
                  ) : (
                    <div className="text-xs text-text-muted py-2.5 px-5 pl-12 italic">
                      No tasks linked to this goal yet.
                    </div>
                  )}

                  {/* Outcome assessment inline picker */}
                  {isAssessing && (
                    <div className="px-5 py-2.5 border-t border-border-subtle/50 flex items-center gap-2 flex-wrap bg-bg-secondary/40">
                      <span className="text-xs text-text-muted font-medium">Assess outcome:</span>
                      {(["ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED", "NOT_ASSESSED"] as const).map(
                        (outcome) => (
                          <button
                            key={outcome}
                            type="button"
                            onClick={() => onAssessOutcome?.(goal.id, outcome)}
                            className={`text-xs px-2.5 py-0.5 rounded border transition-colors cursor-pointer ${
                              goal.outcome === outcome
                                ? "border-border-hover bg-text-primary text-bg-default font-medium shadow-xs"
                                : "border-border-subtle text-text-muted hover:text-text-primary hover:bg-bg-secondary"
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
        <div className="border-t border-border-subtle">
          <div className="flex items-center justify-between px-5 py-2.5 bg-bg-secondary/30">
            <span className="text-xs font-medium text-text-secondary">
              Independent Tasks
            </span>
            <span className="text-xs font-mono text-text-muted">
              {independentTasks.length} {independentTasks.length === 1 ? "task" : "tasks"}
            </span>
          </div>
          <div className="divide-y divide-border-subtle/30 bg-bg-secondary/10">
            {independentTasks.map((task) => {
              const isDone = task.status === "done";
              return (
                <div
                  key={task.id}
                  className="group flex items-center justify-between py-2 px-5 pl-8 hover:bg-bg-secondary/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {onToggleTask && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleTask(task);
                        }}
                        aria-label={isDone ? `Mark incomplete: ${task.title}` : `Mark complete: ${task.title}`}
                        className="text-text-muted hover:text-emerald-500 transition-colors shrink-0 p-0.5 cursor-pointer"
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500/20" />
                        ) : (
                          <Circle className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <span
                      className={`text-xs truncate transition-colors ${
                        isDone
                          ? "text-text-muted line-through opacity-70"
                          : "text-text-primary"
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 ml-3">
                    {task.plannedDurationMinutes && (
                      <span className={`text-[11px] font-mono text-text-muted flex items-center gap-1 ${isDone ? "opacity-50" : ""}`}>
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
