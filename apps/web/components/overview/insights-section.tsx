"use client";

import { Lightbulb, Sparkles, Compass, ArrowRight } from "lucide-react";
import type { DailyAnalytics } from "../../src/lib/api/analytics";

interface InsightsSectionProps {
  analytics?: DailyAnalytics;
  onStartBlock?: () => void;
}

export function InsightsSection({ analytics, onStartBlock }: InsightsSectionProps) {
  const patterns = analytics?.patterns || [];
  const checkInsCount = analytics?.checkIns ?? 0;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[#232733] bg-[#111319] p-5 flex flex-col gap-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8f96a8]">
            Behavioral Insights
          </span>
          <span className="text-[#4b5162]">•</span>
          <span className="text-xs text-[#9ca3af] font-medium">
            Signal Analysis
          </span>
        </div>
        <span className="text-[10px] text-[#6b7280]">Evidence-based</span>
      </div>

      {/* Main Insight or Baseline Notice */}
      {patterns.length > 0 ? (
        <div className="space-y-2.5">
          {patterns.slice(0, 2).map((p, idx) => {
            const label =
              p.dimension === "hour"
                ? `Hour ${p.key}:00 Peak Window`
                : `${p.key} Productivity Cluster`;
            const activeMins = Math.round(p.activeSeconds / 60);

            return (
              <div
                key={idx}
                className="p-3.5 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b] space-y-1.5"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-[#f4f4f6]">
                  <Lightbulb size={13} className="text-[#707df7] shrink-0" />
                  <span>{label}</span>
                </div>
                <p className="text-[11px] text-[#9ca3af] leading-relaxed">
                  Produced {p.completedTasks} completed tasks across {p.sessions} focus sessions with {activeMins}m active focus.
                </p>
                <div className="text-[10px] font-mono text-[#6b7280] pt-1 border-t border-[#1a1d26]">
                  Evidence: {p.sessions} sessions analyzed
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-3.5 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b] space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#f4f4f6]">
            <Compass size={14} className="text-[#707df7] shrink-0" />
            <span>Building your personal baseline...</span>
          </div>
          <p className="text-[11px] text-[#9ca3af] leading-relaxed">
            ProductiveHix requires 3–5 active days to correlate desktop focus with task completion rates and surface verified behavioral patterns.
          </p>
          <div className="text-[10px] text-[#6b7280] pt-1 flex items-center justify-between border-t border-[#1a1d26]">
            <span>Recorded: {checkInsCount} reflections</span>
            <span className="text-[#9ca3af] font-medium">Collecting signals</span>
          </div>
        </div>
      )}

      {/* Recommendation Card / What to do next */}
      <div className="p-3.5 rounded-[var(--radius-md)] bg-[#707df7]/10 border border-[#707df7]/25 space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-[#f4f4f6]">
          <span className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-[#707df7]" /> What to do next
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[#707df7] font-semibold">
            Recommendation
          </span>
        </div>
        <p className="text-[11px] text-[#9ca3af] leading-relaxed">
          You have maintained 42 minutes of continuous coding. Consider a 5-minute cognitive break or commit your changes to lock in this block.
        </p>
        <div className="pt-1 flex items-center gap-2">
          <button
            onClick={onStartBlock}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#707df7] hover:text-[#828ef9] transition-colors"
          >
            Start 45m implementation block <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
