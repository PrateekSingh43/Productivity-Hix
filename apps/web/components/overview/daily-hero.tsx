"use client";

import { format } from "date-fns";
import { ArrowRight, Play, CheckCircle2, Timer, BookOpen, Clock } from "lucide-react";
import type { ActivitySummary } from "@repo/types";
import type { DailyAnalytics } from "../../src/lib/api/analytics";

interface DailyHeroProps {
  activity?: ActivitySummary;
  analytics?: DailyAnalytics;
  completedTasksCount: number;
  totalTasksCount: number;
  onStartSession?: () => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function DailyHero({
  activity,
  analytics,
  completedTasksCount,
  totalTasksCount,
  onStartSession,
}: DailyHeroProps) {
  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12
      ? "GOOD MORNING"
      : currentHour < 17
      ? "GOOD AFTERNOON"
      : "GOOD EVENING";

  const dateString = format(new Date(), "EEEE, MMMM d");
  const activeSeconds = activity?.activeTime ?? 0;
  const sessionsCount = activity?.sessions ?? 0;

  return (
    <section className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[#232733] bg-[#111319] p-6 md:p-8 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#707df7]/8 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-6">
        {/* Header line */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#707df7]">
              {greeting}, PRATEEK
            </span>
            <span className="text-[#4b5162] text-xs">•</span>
            <span className="text-xs text-[#8f96a8] font-normal">{dateString}</span>
          </div>

          <p className="text-sm md:text-[15px] text-[#9ca3af] mt-0.5 max-w-2xl leading-relaxed">
            {activeSeconds > 0 ? (
              <>
                You have been active for{" "}
                <span className="text-[#f4f4f6] font-medium">{formatDuration(activeSeconds)}</span>{" "}
                today across{" "}
                <span className="text-[#f4f4f6] font-medium">
                  {sessionsCount} {sessionsCount === 1 ? "session" : "sessions"}
                </span>
                .{" "}
                {completedTasksCount > 0
                  ? `${completedTasksCount} tasks completed so far.`
                  : "Ready to focus on today's priorities."}
              </>
            ) : (
              "Your workspace is ready. Begin your first focus block or review upcoming priorities."
            )}
          </p>
        </div>

        {/* Hierarchical Metrics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 pt-2">
          {/* Primary Metric */}
          <div className="flex flex-col p-4 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b]">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[#6b7280] flex items-center gap-1.5">
              <Clock size={12} className="text-[#707df7]" /> Active today
            </span>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl md:text-3xl font-semibold tracking-tight text-[#f4f4f6]">
                {formatDuration(activeSeconds)}
              </span>
            </div>
            <span className="text-[10px] text-[#4b5162] mt-0.5">Desktop & browser</span>
          </div>

          {/* Sessions */}
          <div className="flex flex-col p-4 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b]">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[#6b7280] flex items-center gap-1.5">
              <Timer size={12} className="text-[#9ca3af]" /> Focus Sessions
            </span>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl md:text-3xl font-semibold tracking-tight text-[#f4f4f6]">
                {sessionsCount}
              </span>
              <span className="text-xs text-[#6b7280]">logged</span>
            </div>
            <span className="text-[10px] text-[#4b5162] mt-0.5">
              {sessionsCount > 0 ? "Target: 4 sessions" : "No sessions yet"}
            </span>
          </div>

          {/* Tasks Completed */}
          <div className="flex flex-col p-4 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b]">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[#6b7280] flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-[#9ca3af]" /> Tasks Done
            </span>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl md:text-3xl font-semibold tracking-tight text-[#f4f4f6]">
                {completedTasksCount}
              </span>
              <span className="text-xs text-[#6b7280]">/ {totalTasksCount || 3}</span>
            </div>
            <span className="text-[10px] text-[#4b5162] mt-0.5">
              {totalTasksCount > 0
                ? `${Math.round((completedTasksCount / totalTasksCount) * 100)}% completion`
                : "Active priorities"}
            </span>
          </div>

          {/* Learning Recall */}
          <div className="flex flex-col p-4 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b]">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[#6b7280] flex items-center gap-1.5">
              <BookOpen size={12} className="text-[#9ca3af]" /> Recall Retention
            </span>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl md:text-3xl font-semibold tracking-tight text-[#f4f4f6]">
                78%
              </span>
              <span className="text-xs text-emerald-400 font-medium">stable</span>
            </div>
            <span className="text-[10px] text-[#4b5162] mt-0.5">2 reviews due today</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onStartSession}
            className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[#707df7] px-3.5 py-2 text-xs font-medium text-white transition-all hover:bg-[#828ef9] shadow-sm"
          >
            <Play size={12} className="fill-current" />
            Continue current task
          </button>
          <a
            href="#checkin"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[#272b38] bg-[#161822] px-3 py-2 text-xs font-medium text-[#9ca3af] hover:text-white hover:border-[#383e50] transition-colors"
          >
            Quick check-in <ArrowRight size={12} />
          </a>
        </div>
      </div>
    </section>
  );
}
