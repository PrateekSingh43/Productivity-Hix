"use client";

import { useState } from "react";
import { Plus, Clock, Flag, AlignLeft, X, Target, Calendar } from "lucide-react";
import { format, addDays } from "date-fns";
import type { TaskPriority } from "@repo/types";
import { useCreateTaskMutation } from "../../src/hooks/mutations/use-task-mutations";
import { useTodayPlan } from "../../src/hooks/queries/use-plans";

interface TaskQuickAddProps {
  onSuccess?: () => void;
}

const DURATION_PRESETS = [
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "45m", value: 45 },
  { label: "1h", value: 60 },
  { label: "1.5h", value: 90 },
  { label: "2h", value: 120 },
];

const PRIORITIES: Array<{ label: string; value: TaskPriority; color: string }> = [
  { label: "High", value: "high", color: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
  { label: "Medium", value: "medium", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  { label: "Low", value: "low", color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  { label: "None", value: "none", color: "text-text-muted bg-bg-secondary border-border-subtle" },
];

export function TaskQuickAdd({ onSuccess }: TaskQuickAddProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [plannedDurationMinutes, setPlannedDurationMinutes] = useState<number>(30);
  const [goalId, setGoalId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));

  const { data: plan } = useTodayPlan();
  const goals = plan?.goals ?? [];
  const createTaskMutation = useCreateTaskMutation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    createTaskMutation.mutate(
      {
        title: cleanTitle,
        description: description.trim() || null,
        priority,
        plannedDurationMinutes,
        dueAt: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
        goalId: goalId ? goalId : null,
        productiveDate: plan?.date || null,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setShowNotes(false);
          setPriority("medium");
          setPlannedDurationMinutes(30);
          setGoalId("");
          setIsOpen(false);
          onSuccess?.();
        },
      },
    );
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const tomorrowStr = format(addDays(new Date(), 1), "yyyy-MM-dd");

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full py-3 px-4 rounded-[var(--radius-lg)] border border-dashed border-border-subtle bg-bg-card/70 hover:bg-bg-secondary hover:border-border-hover text-text-secondary hover:text-text-primary text-xs font-medium flex items-center justify-center gap-2 transition-all group shadow-2xs cursor-pointer"
      >
        <span className="h-5 w-5 rounded-full bg-bg-secondary border border-border-subtle flex items-center justify-center text-text-primary group-hover:scale-110 transition-transform">
          <Plus size={13} />
        </span>
        <span>+ Add task or intention...</span>
        <span className="text-[10px] text-text-muted font-mono ml-1">(quick add)</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[var(--radius-lg)] border border-border-subtle bg-bg-card p-4 shadow-sm space-y-3.5 transition-all"
    >
      {/* Title input with close button */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you intend to get done? (e.g. Finish timeline aggregation)"
          className="flex-1 bg-transparent border-none text-sm font-medium text-text-primary placeholder:text-text-muted outline-none"
          autoFocus
        />
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-text-muted hover:text-text-primary p-1 rounded transition-colors cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      {/* Optional Description / Notes */}
      {showNotes ? (
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add context, acceptance criteria, or intention notes..."
          rows={2}
          className="w-full rounded-[var(--radius-sm)] border border-border-subtle bg-bg-secondary p-2.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors resize-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="inline-flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
        >
          <AlignLeft size={12} />
          + Add notes / context
        </button>
      )}

      {/* Controls Bar: Duration Pills & Priority Selector & Due Date & Submit */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border-subtle">
        {/* Planned Duration Selection */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-text-muted flex items-center gap-1 mr-1">
            <Clock size={11} />
            Planned:
          </span>
          {DURATION_PRESETS.map((preset) => {
            const isSelected = plannedDurationMinutes === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => setPlannedDurationMinutes(preset.value)}
                className={`px-2 py-1 rounded-[var(--radius-sm)] text-[11px] font-mono transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-text-primary text-bg-primary font-medium"
                    : "bg-bg-secondary text-text-muted border border-border-subtle hover:text-text-primary hover:border-border-hover"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Due Date Presets & Custom Picker */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-text-muted flex items-center gap-1 mr-1">
            <Calendar size={11} />
            Due:
          </span>
          <button
            type="button"
            onClick={() => setDueDate(todayStr)}
            className={`px-2 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-semibold transition-colors cursor-pointer ${
              dueDate === todayStr
                ? "bg-text-primary text-bg-primary"
                : "bg-bg-secondary text-text-muted border border-border-subtle hover:text-text-primary"
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setDueDate(tomorrowStr)}
            className={`px-2 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-semibold transition-colors cursor-pointer ${
              dueDate === tomorrowStr
                ? "bg-text-primary text-bg-primary"
                : "bg-bg-secondary text-text-muted border border-border-subtle hover:text-text-primary"
            }`}
          >
            Tomorrow
          </button>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="text-[11px] bg-bg-secondary border border-border-subtle rounded-[var(--radius-sm)] px-2 py-0.5 text-text-primary outline-none cursor-pointer"
            title="Custom due date"
          />
        </div>

        {/* Goal, Priority and Submit button */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Goal Selector */}
          {goals.length > 0 && (
            <div className="flex items-center gap-1 bg-bg-secondary border border-border-subtle px-2 py-1 rounded-[var(--radius-sm)]">
              <Target size={11} className="text-text-muted" />
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="bg-transparent border-none text-[11px] font-medium text-text-primary outline-none max-w-[150px] truncate cursor-pointer [&>option]:bg-bg-card [&>option]:text-text-primary"
                title="Link this task to a Daily Goal"
              >
                <option value="">
                  No Goal (Independent)
                </option>
                {goals.map((g) => (
                  <option
                    key={g.id}
                    value={g.id}
                  >
                    Goal: {g.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Priority Pill Selector */}
          <div className="flex items-center gap-1 bg-bg-secondary border border-border-subtle p-0.5 rounded-[var(--radius-sm)]">
            <span className="px-1.5 text-[10px] text-text-muted uppercase tracking-wider font-semibold">
              <Flag size={10} className="inline mr-1" />
              Priority
            </span>
            {PRIORITIES.map((p) => {
              const isSelected = priority === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`px-2 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-semibold tracking-wide transition-colors cursor-pointer ${
                    isSelected
                      ? `${p.color} border`
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!title.trim() || createTaskMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--radius-sm)] bg-text-primary text-bg-primary text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            <Plus size={13} />
            {createTaskMutation.isPending ? "Creating..." : "Add Task"}
          </button>
        </div>
      </div>
    </form>
  );
}
