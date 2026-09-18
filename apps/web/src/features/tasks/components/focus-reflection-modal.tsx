"use client";

import { useState } from "react";
import { CheckCircle2, Sparkles, X, Battery, BatteryCharging, BatteryLow } from "lucide-react";
import { createCheckIn } from "@features/sessions";
import { useQueryClient } from "@tanstack/react-query";

interface FocusReflectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: {
    id: string;
    taskId?: string | null;
    taskTitle?: string | null;
    durationSeconds?: number | null;
  } | null;
}

const ASSESSMENTS = [
  { id: "deep_focus", label: "Deep Flow", desc: "Immersion & high clarity", color: "emerald" },
  { id: "useful_not_productive", label: "Good Progress", desc: "Steady forward momentum", color: "blue" },
  { id: "distracted", label: "Distracted", desc: "Context switching / tangents", color: "amber" },
  { id: "blocked", label: "Blocked", desc: "Hit technical wall or bottleneck", color: "rose" },
] as const;

export function FocusReflectionModal({ isOpen, onClose, session }: FocusReflectionModalProps) {
  const queryClient = useQueryClient();
  const [selectedAssessment, setSelectedAssessment] = useState<string>("deep_focus");
  const [energy, setEnergy] = useState<"low" | "medium" | "high">("medium");
  const [outcome, setOutcome] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !session) return null;

  const durationMins = session.durationSeconds
    ? Math.max(1, Math.round(session.durationSeconds / 60))
    : 1;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);
    try {
      await createCheckIn({
        workSessionId: session.id,
        taskId: session.taskId || null,
        intent: session.taskTitle ? `Focus on ${session.taskTitle}` : "Focus session reflection",
        activityAssessment: selectedAssessment,
        energy,
        productive: selectedAssessment === "deep_focus" || selectedAssessment === "useful_not_productive",
        progress: selectedAssessment !== "blocked",
        blocker: selectedAssessment === "blocked" ? (outcome || "Blocked during session") : null,
        outcome: outcome.trim() || null,
        source: "web_focus_ended",
      });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["check-ins"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      onClose();
    } catch (err) {
      console.error("Failed to save focus reflection:", err);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-2xl border border-border-subtle bg-bg-card shadow-2xl p-6 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Line */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-sky-500 to-indigo-500" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="space-y-1.5 mb-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-500">
            <Sparkles size={14} />
            <span>Focus Session Completed</span>
          </div>
          <h2 className="text-lg font-bold text-text-primary">
            {durationMins}m Focus Reflection
          </h2>
          {session.taskTitle && (
            <p className="text-xs text-text-muted truncate max-w-[340px]">
              Task: <span className="text-text-secondary font-medium">{session.taskTitle}</span>
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Assessment Grid */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary">
              How did this focus block feel?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ASSESSMENTS.map((item) => {
                const isSelected = selectedAssessment === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedAssessment(item.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-text-primary bg-bg-secondary shadow-sm"
                        : "border-border-subtle bg-bg-secondary/40 hover:border-border-hover hover:bg-bg-secondary/60 text-text-muted"
                    }`}
                  >
                    <div className="text-xs font-semibold text-text-primary">{item.label}</div>
                    <div className="text-[10px] text-text-muted leading-tight mt-0.5">{item.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Energy Level */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-text-secondary">
              Current Energy Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "high", label: "High", icon: BatteryCharging },
                  { id: "medium", label: "Medium", icon: Battery },
                  { id: "low", label: "Low", icon: BatteryLow },
                ] as const
              ).map((lvl) => {
                const isSelected = energy === lvl.id;
                const Icon = lvl.icon;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => setEnergy(lvl.id)}
                    className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? "border-text-primary bg-bg-secondary text-text-primary"
                        : "border-border-subtle bg-bg-secondary/40 text-text-muted hover:border-border-hover hover:text-text-secondary"
                    }`}
                  >
                    <Icon size={14} />
                    <span>{lvl.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes / Debrief */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary">
                Accomplishments & Debrief Notes <span className="text-[10px] text-text-muted">(optional)</span>
              </label>
              <span className={`text-[10px] ${outcome.length >= 480 ? "text-amber-400 font-semibold" : "text-text-muted"}`}>
                {outcome.length}/500
              </span>
            </div>
            <textarea
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              maxLength={500}
              placeholder="What did you get done? Any unexpected findings or blockers?"
              rows={3}
              className="w-full px-3 py-2 text-xs rounded-xl border border-border-subtle bg-bg-secondary/50 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-strong transition-colors resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-text-primary text-bg-primary hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer font-semibold shadow-sm"
            >
              <CheckCircle2 size={13} />
              <span>{isSubmitting ? "Saving..." : "Complete Reflection"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
