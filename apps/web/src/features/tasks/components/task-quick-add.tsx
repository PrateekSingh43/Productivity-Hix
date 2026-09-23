"use client";

import { useState } from "react";
import { Plus, Flag, AlignLeft, X, Target, Calendar } from "lucide-react";
import { format, addDays } from "date-fns";
import { resolveProductiveDay, type TaskPriority } from "@repo/types";
import { useCreateTaskMutation } from "../api/mutations";
import { useTodayPlan } from "@features/today";
import { PlannedFocusPicker } from "./planned-focus-picker";

interface TaskQuickAddProps {
  onSuccess?: () => void;
}

export function TaskQuickAdd({ onSuccess }: TaskQuickAddProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [plannedDurationMinutes, setPlannedDurationMinutes] = useState<number>(30);
  const [goalId, setGoalId] = useState<string>("");
  const [scheduleMode, setScheduleMode] = useState<"today" | "tomorrow" | "custom">("today");
  const [dueDate, setDueDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));

  const { data: plan } = useTodayPlan();
  const goals = plan?.goals ?? [];
  const createTaskMutation = useCreateTaskMutation();

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const tomorrowStr = format(addDays(new Date(), 1), "yyyy-MM-dd");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    const finalDuration = Math.max(1, plannedDurationMinutes || 30);
    const finalDueDate =
      scheduleMode === "today"
        ? todayStr
        : scheduleMode === "tomorrow"
        ? tomorrowStr
        : dueDate;

    createTaskMutation.mutate(
      {
        title: cleanTitle,
        description: description.trim() || null,
        priority,
        plannedDurationMinutes: finalDuration,
        dueAt: finalDueDate ? new Date(`${finalDueDate}T23:59:59`).toISOString() : null,
        goalId: goalId ? goalId : null,
        productiveDate: finalDueDate || plan?.date || resolveProductiveDay(),
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setShowNotes(false);
          setPriority("medium");
          setPlannedDurationMinutes(30);
          setGoalId("");
          setScheduleMode("today");
          setDueDate(todayStr);
          setIsOpen(false);
          onSuccess?.();
        },
      },
    );
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full py-3 px-4 rounded-xl border border-dashed border-border-subtle bg-bg-card hover:bg-bg-secondary hover:border-border-hover text-text-secondary hover:text-text-primary text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer"
      >
        <span className="h-5 w-5 rounded-full bg-bg-secondary border border-border-subtle flex items-center justify-center text-text-primary">
          <Plus size={13} />
        </span>
        <span>Add a task...</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border-hover bg-bg-card p-4 space-y-3.5 transition-all shadow-xs"
    >
      {/* Title input with close button */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task..."
          className="flex-1 bg-transparent border-none text-sm font-medium text-text-primary placeholder:text-text-muted outline-none"
          autoFocus
        />
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-text-muted hover:text-text-primary p-1 rounded-md transition-colors cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      {/* Optional Description / Notes */}
      {showNotes ? (
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add context or notes..."
          rows={2}
          className="w-full rounded-md border border-border-subtle bg-bg-secondary p-2.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-border-hover transition-colors resize-none leading-relaxed"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
        >
          <AlignLeft size={12} />
          <span>+ Add notes / context</span>
        </button>
      )}

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-border-subtle">
        <div className="flex flex-wrap items-center gap-2">
          {/* Schedule Compact Control */}
          <div className="flex items-center gap-1.5 bg-bg-secondary border border-border-subtle rounded-md px-2 py-1 text-xs">
            <Calendar size={11} className="text-text-muted shrink-0" />
            <select
              value={scheduleMode}
              onChange={(e) => {
                const mode = e.target.value as "today" | "tomorrow" | "custom";
                setScheduleMode(mode);
                if (mode === "today") setDueDate(todayStr);
                else if (mode === "tomorrow") setDueDate(tomorrowStr);
              }}
              className="bg-transparent border-none text-xs text-text-primary outline-none cursor-pointer [&>option]:bg-bg-card [&>option]:text-text-primary"
              title="Task schedule"
            >
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="custom">Custom Date</option>
            </select>
            {scheduleMode === "custom" && (
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="text-xs bg-transparent border-none text-text-primary outline-none cursor-pointer pl-1"
                title="Select due date"
              />
            )}
          </div>

          {/* Planned Focus Compact Control */}
          <PlannedFocusPicker
            value={plannedDurationMinutes}
            onChange={(mins) => setPlannedDurationMinutes(mins)}
          />

          {/* Priority Compact Control */}
          <div className="flex items-center gap-1.5 bg-bg-secondary border border-border-subtle rounded-md px-2 py-1 text-xs">
            <Flag size={11} className="text-text-muted shrink-0" />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="bg-transparent border-none text-xs text-text-primary outline-none cursor-pointer [&>option]:bg-bg-card [&>option]:text-text-primary"
              title="Priority"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="none">None</option>
            </select>
          </div>

          {/* Goal Selector (Optional) */}
          {goals.length > 0 && (
            <div className="flex items-center gap-1.5 bg-bg-secondary border border-border-subtle rounded-md px-2 py-1 text-xs">
              <Target size={11} className="text-text-muted shrink-0" />
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="bg-transparent border-none text-xs text-text-primary outline-none max-w-[140px] truncate cursor-pointer [&>option]:bg-bg-card [&>option]:text-text-primary"
                title="Daily goal (optional)"
              >
                <option value="">No Goal</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    Goal: {g.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Primary Action Button */}
        <button
          type="submit"
          disabled={!title.trim() || createTaskMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-text-primary text-bg-default text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed shadow-xs shrink-0 ml-auto"
        >
          <Plus size={13} />
          <span>{createTaskMutation.isPending ? "Creating..." : "Add Task"}</span>
        </button>
      </div>
    </form>
  );
}
