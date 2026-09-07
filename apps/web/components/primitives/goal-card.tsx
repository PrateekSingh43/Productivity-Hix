"use client";

import React, { useState } from "react";
import { Target, CheckCircle2, Edit3, ArrowRight, Sparkles } from "lucide-react";
import { PriorityList } from "./priority-list";
import { OutcomeBadge } from "./data-badge";

export type GoalCardState =
  | "planned"
  | "unplanned"
  | "editable"
  | "planning-tomorrow"
  | "outcome-pending"
  | "outcome-assessed";

export interface GoalCardProps {
  state?: GoalCardState;
  mode?: "today" | "tomorrow" | "historical";
  dateLabel?: string;
  goalTitle?: string;
  priorities?: string[];
  outcome?: "Achieved" | "Partially achieved" | "Not achieved" | "Not assessed";
  onPlanToday?: () => void;
  onPlanTomorrow?: () => void;
  onEdit?: () => void;
  onSave?: (goal: string, priorities: string[]) => void;
  onCancel?: () => void;
  onAssessOutcome?: (outcome: "Achieved" | "Partially achieved" | "Not achieved" | "Not assessed") => void;
  className?: string;
}

export function GoalCard({
  state = "planned",
  mode = "today",
  dateLabel,
  goalTitle = "",
  priorities = [],
  outcome,
  onPlanToday,
  onPlanTomorrow,
  onEdit,
  onSave,
  onCancel,
  onAssessOutcome,
  className = "",
}: GoalCardProps) {
  const [draftGoal, setDraftGoal] = useState(goalTitle);
  const [draftPriorities, setDraftPriorities] = useState<string[]>(
    priorities.length > 0 ? priorities : ["", "", ""]
  );

  const handlePriorityChange = (idx: number, val: string) => {
    const next = [...draftPriorities];
    next[idx] = val;
    setDraftPriorities(next);
  };

  const handleSave = () => {
    const cleaned = draftPriorities.filter((p) => p.trim().length > 0);
    onSave?.(draftGoal, cleaned);
  };

  // 1. UNPLANNED STATE
  if (state === "unplanned") {
    return (
      <div
        className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-5 sm:p-6 space-y-4 ${className}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
            {mode === "tomorrow" ? "TOMORROW'S INTENTION" : "DAILY INTENTION"}
          </span>
          {dateLabel && (
            <span className="text-xs text-[var(--foreground-muted)] font-mono">{dateLabel}</span>
          )}
        </div>

        <div className="space-y-1 max-w-lg">
          <h2 className="text-base sm:text-lg font-semibold text-[var(--foreground-primary)] tracking-tight">
            Your day hasn&apos;t been planned yet
          </h2>
          <p className="text-xs sm:text-sm text-[var(--foreground-muted)] leading-relaxed">
            What would make today successful? Take 30 seconds to define your Daily Goal and key priorities.
          </p>
        </div>

        <button
          type="button"
          onClick={mode === "tomorrow" ? onPlanTomorrow : onPlanToday}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--foreground-primary)] hover:opacity-90 text-[var(--background-primary)] text-xs font-semibold px-4 py-2 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground-primary)]"
        >
          <Target size={14} />
          <span>{mode === "tomorrow" ? "Plan Tomorrow" : "Plan Today"}</span>
          <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  // 2. EDITABLE FORM STATE
  if (state === "editable") {
    return (
      <div
        className={`rounded-lg border border-indigo-500/40 bg-[var(--background-card)] p-5 sm:p-6 space-y-4 ${className}`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
            <Edit3 size={13} />
            <span>{mode === "tomorrow" ? "EDIT TOMORROW'S PLAN" : "EDIT DAILY PLAN"}</span>
          </span>
          {dateLabel && (
            <span className="text-xs text-[var(--foreground-muted)] font-mono">{dateLabel}</span>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="goal-input"
              className="block text-xs font-medium text-[var(--foreground-primary)] mb-1"
            >
              Daily Goal (exactly 1)
            </label>
            <input
              id="goal-input"
              type="text"
              value={draftGoal}
              onChange={(e) => setDraftGoal(e.target.value)}
              placeholder="e.g. Ship Phase 2 Presentation Primitives"
              className="w-full text-sm bg-[var(--background-subtle)] border border-[var(--border-subtle)] rounded-md px-3 py-2 text-[var(--foreground-primary)] placeholder:text-[var(--foreground-muted)] focus-visible:outline-none focus-visible:border-[var(--foreground-primary)]"
            />
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-[var(--foreground-primary)]">
              Daily priorities (1–3 strategic pillars)
            </span>
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="font-mono text-xs text-[var(--foreground-muted)] w-6 shrink-0 text-right">
                  0{idx + 1}
                </span>
                <input
                  type="text"
                  value={draftPriorities[idx] || ""}
                  onChange={(e) => handlePriorityChange(idx, e.target.value)}
                  placeholder={`Priority ${idx + 1} ${idx === 0 ? "(required)" : "(optional)"}`}
                  className="flex-1 text-xs bg-[var(--background-subtle)] border border-[var(--border-subtle)] rounded-md px-2.5 py-1.5 text-[var(--foreground-primary)] placeholder:text-[var(--foreground-muted)] focus-visible:outline-none focus-visible:border-[var(--foreground-primary)]"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] px-3 py-1.5 rounded-md hover:bg-[var(--background-subtle)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="text-xs font-medium bg-[var(--foreground-primary)] text-[var(--background-primary)] hover:opacity-90 px-3.5 py-1.5 rounded-md transition-opacity"
          >
            Save Plan
          </button>
        </div>
      </div>
    );
  }

  // 3. OUTCOME PENDING STATE (Awaiting assessment at end of day)
  if (state === "outcome-pending") {
    return (
      <div
        className={`rounded-lg border border-amber-500/30 bg-[var(--background-card)] p-5 sm:p-6 space-y-4 ${className}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <Sparkles size={13} />
            <span>AWAITING OUTCOME ASSESSMENT</span>
          </span>
          {dateLabel && (
            <span className="text-xs text-[var(--foreground-muted)] font-mono">{dateLabel}</span>
          )}
        </div>

        <div className="space-y-1">
          <span className="text-xs text-[var(--foreground-muted)]">Daily goal</span>
          <h2 className="text-base sm:text-lg font-semibold text-[var(--foreground-primary)]">
            {goalTitle || "Untitled Daily Goal"}
          </h2>
        </div>

        {priorities.length > 0 && <PriorityList priorities={priorities} />}

        <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
          <span className="block text-xs font-medium text-[var(--foreground-primary)]">
            Did you achieve today&apos;s goal?
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(["Achieved", "Partially achieved", "Not achieved", "Not assessed"] as const).map(
              (opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onAssessOutcome?.(opt)}
                  className={`text-xs font-medium py-1.5 px-2 rounded-md border transition-colors text-center ${
                    opt === "Not assessed"
                      ? "border-[var(--border-subtle)] bg-[var(--background-subtle)] text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)]"
                      : "border-[var(--border-subtle)] hover:border-[var(--foreground-muted)] bg-[var(--background-card)] text-[var(--foreground-primary)] hover:bg-[var(--background-subtle)]"
                  }`}
                >
                  {opt}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  // 4. PLANNING TOMORROW STATE (Workflow state)
  if (state === "planning-tomorrow") {
    return (
      <div
        className={`rounded-lg border border-indigo-500/30 bg-[var(--background-card)] p-5 sm:p-6 space-y-4 ${className}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
            TOMORROW&apos;S PLAN
          </span>
          {dateLabel && (
            <span className="text-xs text-[var(--foreground-muted)] font-mono">{dateLabel}</span>
          )}
        </div>

        <div className="space-y-1">
          <span className="text-xs text-[var(--foreground-muted)]">Tomorrow&apos;s goal</span>
          <h2 className="text-base sm:text-lg font-semibold text-[var(--foreground-primary)]">
            {goalTitle || "Untitled Goal"}
          </h2>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs text-[var(--foreground-muted)]">
            Priorities
          </span>
          <PriorityList priorities={priorities} />
        </div>

        <div className="pt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] flex items-center gap-1 transition-colors"
          >
            <Edit3 size={12} />
            <span>Edit Tomorrow&apos;s Plan</span>
          </button>
        </div>
      </div>
    );
  }

  // 5. OUTCOME ASSESSED STATE
  if (state === "outcome-assessed") {
    const isAssessed = outcome && outcome !== "Not assessed";

    return (
      <div
        className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-5 sm:p-6 space-y-4 ${className}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
            {isAssessed ? "ASSESSED DAILY GOAL" : "DAILY PLAN"}
          </span>
          <div className="flex items-center gap-2">
            {outcome && <OutcomeBadge outcome={outcome} />}
            {dateLabel && (
              <span className="text-xs text-[var(--foreground-muted)] font-mono">{dateLabel}</span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-[var(--foreground-muted)]">Daily goal</span>
          <h2 className="text-base sm:text-lg font-semibold text-[var(--foreground-primary)]">
            {goalTitle || "Untitled Goal"}
          </h2>
        </div>

        {priorities.length > 0 && <PriorityList priorities={priorities} />}
      </div>
    );
  }

  // 6. PLANNED STATE (Normal daytime operational view)
  return (
    <div
      className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-5 sm:p-6 space-y-4 ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
          TODAY&apos;S PLAN
        </span>
        <div className="flex items-center gap-3">
          {dateLabel && (
            <span className="text-xs text-[var(--foreground-muted)] font-mono">{dateLabel}</span>
          )}
          {onAssessOutcome && (
            <button
              type="button"
              onClick={() => onAssessOutcome("Not assessed")}
              className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] flex items-center gap-1 transition-colors"
              aria-label="Assess Goal Outcome"
            >
              <CheckCircle2 size={12} />
              <span>Assess Outcome</span>
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--foreground-primary)]"
              aria-label="Edit Daily Plan"
            >
              <Edit3 size={12} />
              <span>Edit Plan</span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-xs text-[var(--foreground-muted)]">Daily goal</span>
        <h2 className="text-base sm:text-lg font-semibold text-[var(--foreground-primary)] tracking-tight">
          {goalTitle || "No goal set"}
        </h2>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs text-[var(--foreground-muted)]">
          Priorities ({priorities.length})
        </span>
        <PriorityList priorities={priorities} />
      </div>
    </div>
  );
}
