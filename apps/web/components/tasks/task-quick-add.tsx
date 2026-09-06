"use client";

import { useState } from "react";
import { Plus, Clock, Flag, AlignLeft, X } from "lucide-react";
import type { TaskPriority } from "@repo/types";
import { useCreateTaskMutation } from "../../src/hooks/mutations/use-task-mutations";

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
  { label: "High", value: "high", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
  { label: "Medium", value: "medium", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { label: "Low", value: "low", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { label: "None", value: "none", color: "text-[#8f96a8] bg-[#1a1c24] border-[#292d3a]" },
];

export function TaskQuickAdd({ onSuccess }: TaskQuickAddProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [plannedDurationMinutes, setPlannedDurationMinutes] = useState<number>(30);

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
      },
      {
        onSuccess: () => {
          setTitle("");
          setDescription("");
          setShowNotes(false);
          setPriority("medium");
          setPlannedDurationMinutes(30);
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
        className="w-full py-3 px-4 rounded-[var(--radius-lg)] border border-dashed border-[#262b3a] bg-[#0e1017]/70 hover:bg-[#13151f] hover:border-[#3b435a] text-[#8f96a8] hover:text-[#f4f4f6] text-xs font-medium flex items-center justify-center gap-2 transition-all group shadow-sm"
      >
        <span className="h-5 w-5 rounded-full bg-[#1b1e2a] border border-[#2d3345] flex items-center justify-center text-[#707df7] group-hover:scale-110 transition-transform">
          <Plus size={13} />
        </span>
        <span>+ Add task or intention for today...</span>
        <span className="text-[10px] text-[#52596d] font-mono ml-1">(quick add)</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[var(--radius-lg)] border border-[#2b3142] bg-[#111319] p-4 shadow-lg space-y-3.5 transition-all"
    >
      {/* Title input with close button */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you intend to get done? (e.g. Finish timeline aggregation)"
          className="flex-1 bg-transparent border-none text-sm font-medium text-[#f4f4f6] placeholder-[#555c70] outline-none"
          autoFocus
        />
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-[#6b7280] hover:text-[#f4f4f6] p-1 rounded transition-colors"
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
          className="w-full rounded-[var(--radius-sm)] border border-[#232733] bg-[#0c0d12] p-2.5 text-xs text-[#f4f4f6] placeholder-[#4f566a] outline-none focus:border-[#707df7] transition-colors resize-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="inline-flex items-center gap-1.5 text-[11px] text-[#6b7280] hover:text-[#9ca3af] transition-colors"
        >
          <AlignLeft size={12} />
          + Add notes / context
        </button>
      )}

      {/* Controls Bar: Duration Pills & Priority Selector & Submit */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#1a1d27]">
        {/* Planned Duration Selection */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-[#6b7280] flex items-center gap-1 mr-1">
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
                className={`px-2 py-1 rounded-[var(--radius-sm)] text-[11px] font-mono transition-colors ${
                  isSelected
                    ? "bg-[#707df7] text-white font-medium"
                    : "bg-[#161822] text-[#8f96a8] border border-[#222634] hover:text-[#f4f4f6]"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Priority and Submit button */}
        <div className="flex items-center gap-2">
          {/* Priority Pill Selector */}
          <div className="flex items-center gap-1 bg-[#0c0d12] border border-[#222634] p-0.5 rounded-[var(--radius-sm)]">
            <span className="px-1.5 text-[10px] text-[#6b7280] uppercase tracking-wider font-semibold">
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
                  className={`px-2 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-semibold tracking-wide transition-colors ${
                    isSelected
                      ? `${p.color} border`
                      : "text-[#6b7280] hover:text-[#9ca3af]"
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
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--radius-sm)] bg-[#707df7] hover:bg-[#5f6de6] text-xs font-semibold text-white transition-opacity disabled:opacity-40"
          >
            <Plus size={13} />
            {createTaskMutation.isPending ? "Creating..." : "Add Task"}
          </button>
        </div>
      </div>
    </form>
  );
}
