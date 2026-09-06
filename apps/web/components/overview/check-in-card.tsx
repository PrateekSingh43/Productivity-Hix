"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useCreateCheckIn } from "../../src/hooks/mutations/use-check-in";

const BLOCKER_TAGS = [
  { id: "focused", label: "Focused Flow" },
  { id: "distraction", label: "Distraction" },
  { id: "unclear", label: "Unclear task" },
  { id: "low_energy", label: "Low energy" },
  { id: "blocker", label: "Technical blocker" },
];

export function CheckInCard() {
  const checkInMutation = useCreateCheckIn();
  const [intent, setIntent] = useState("Implement dashboard information hierarchy");
  const [progress, setProgress] = useState<"yes" | "partially" | "no">("yes");
  const [selectedTag, setSelectedTag] = useState<string>("focused");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    checkInMutation.mutate(
      {
        intent,
        progress: progress === "yes" || progress === "partially",
        productive: selectedTag === "focused",
        blocker: selectedTag !== "focused" ? selectedTag : null,
        outcome: notes || null,
      },
      {
        onSuccess: () => {
          setSubmitted(true);
          setTimeout(() => {
            setSubmitted(false);
            setNotes("");
          }, 3000);
        },
      }
    );
  };

  return (
    <div id="checkin" className="rounded-[var(--radius-lg)] border border-[#232733] bg-[#111319] p-5 flex flex-col gap-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8f96a8]">
            Session Check-in
          </span>
          <span className="text-[#4b5162]">•</span>
          <span className="text-xs text-[#9ca3af] font-medium">
            Reflection
          </span>
        </div>
        <span className="text-[10px] text-[#6b7280]">1–2 min</span>
      </div>

      {submitted ? (
        <div className="p-6 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b] text-center space-y-2">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
            <CheckCircle2 size={16} />
          </div>
          <h4 className="text-xs font-semibold text-[#f4f4f6]">Check-in Recorded</h4>
          <p className="text-[11px] text-[#9ca3af] leading-relaxed">
            Your behavioral reflection has been ingested into your personal feedback loop.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Intention statement */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-[#8f96a8] font-medium">
              You intended to:
            </label>
            <input
              type="text"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-[#232733] bg-[#0c0d12] px-3 py-1.5 text-xs text-[#f4f4f6] outline-none focus:border-[#707df7] transition-colors"
              placeholder="What were you focused on?"
            />
          </div>

          {/* Meaningful progress question */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-[#8f96a8] font-medium">
              Did meaningful progress happen?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "yes", label: "Yes" },
                  { id: "partially", label: "Partially" },
                  { id: "no", label: "No" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setProgress(option.id)}
                  className={`rounded-[var(--radius-sm)] py-1.5 px-2 text-xs font-medium border transition-all ${
                    progress === option.id
                      ? "border-[#707df7] bg-[#707df7]/15 text-[#f4f4f6] shadow-sm"
                      : "border-[#232733] bg-[#0c0d12] text-[#8f96a8] hover:border-[#353b4d] hover:text-[#f4f4f6]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contextual state chips */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-[#8f96a8] font-medium">
              What was your working state?
            </label>
            <div className="flex flex-wrap gap-1.5">
              {BLOCKER_TAGS.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setSelectedTag(tag.id)}
                  className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-medium border transition-all ${
                    selectedTag === tag.id
                      ? "border-[#707df7] bg-[#707df7] text-white shadow-sm"
                      : "border-[#232733] bg-[#0c0d12] text-[#8f96a8] hover:border-[#353b4d] hover:text-[#f4f4f6]"
                  }`}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Notes */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-[#8f96a8] font-medium">
              Notes or blockers (optional):
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Switched to documentation review mid-session"
              className="w-full rounded-[var(--radius-sm)] border border-[#232733] bg-[#0c0d12] px-3 py-1.5 text-xs text-[#f4f4f6] outline-none focus:border-[#707df7] transition-colors"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={checkInMutation.isPending}
            className="w-full rounded-[var(--radius-sm)] bg-[#707df7] py-2 text-xs font-medium text-white transition-opacity hover:bg-[#828ef9] disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
          >
            {checkInMutation.isPending ? "Saving..." : "Save Check-in"}
          </button>
        </form>
      )}
    </div>
  );
}
