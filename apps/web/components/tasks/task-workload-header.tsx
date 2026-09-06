"use client";

import { Calendar, Target, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import type { Task } from "@repo/types";

interface TaskWorkloadHeaderProps {
  tasks: Task[];
}

export function TaskWorkloadHeader({ tasks }: TaskWorkloadHeaderProps) {
  const currentDate = format(new Date(), "EEEE, MMMM d");

  // Calculate planned time for incomplete tasks
  const plannedMinutes = tasks
    .filter((t) => t.status !== "done" && t.status !== "cancelled")
    .reduce((acc, t) => acc + (t.plannedDurationMinutes || 0), 0);

  // Calculate actual time recorded across all tasks
  const actualSeconds = tasks.reduce((acc, t) => acc + (t.actualDurationSeconds || 0), 0);
  const actualMinutes = Math.round(actualSeconds / 60);

  const completedCount = tasks.filter((t) => t.status === "done").length;
  const highPriorityCount = tasks.filter(
    (t) => t.priority === "high" && t.status !== "done",
  ).length;

  const formatHoursMinutes = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const progressPercent =
    tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[#232733] bg-[#111319] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] space-y-5">
      {/* Top row: Title and Date */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8f96a8]">
              Daily Workload & Intention
            </span>
            <span className="text-[#4b5162]">•</span>
            <span className="text-xs text-[#707df7] font-medium flex items-center gap-1">
              <Calendar size={13} />
              {currentDate}
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-[#f4f4f6]">
            What do you intend to accomplish today?
          </h2>
        </div>

        {/* Intention vs Observation Note */}
        <div className="hidden lg:flex items-center text-right">
          <p className="text-[11px] text-[#6b7280] max-w-xs leading-relaxed">
            Tasks define your deliberate intention. Actual time is measured automatically from focus sessions.
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        {/* Planned Effort */}
        <div className="p-3.5 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b] space-y-1">
          <div className="flex items-center gap-1.5 text-[#8f96a8] text-xs font-medium">
            <Clock size={13} className="text-[#707df7]" />
            <span>Planned Workload</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold font-mono text-[#f4f4f6]">
              {formatHoursMinutes(plannedMinutes)}
            </span>
            <span className="text-[11px] text-[#6b7280]">intended</span>
          </div>
        </div>

        {/* Actual Effort */}
        <div className="p-3.5 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b] space-y-1">
          <div className="flex items-center gap-1.5 text-[#8f96a8] text-xs font-medium">
            <Target size={13} className="text-emerald-400" />
            <span>Actual Session Time</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold font-mono text-[#f4f4f6]">
              {formatHoursMinutes(actualMinutes)}
            </span>
            <span className="text-[11px] text-[#6b7280]">from sessions</span>
          </div>
        </div>

        {/* High Priorities */}
        <div className="p-3.5 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b] space-y-1">
          <div className="flex items-center gap-1.5 text-[#8f96a8] text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span>Top Priorities</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold font-mono text-[#f4f4f6]">
              {highPriorityCount}
            </span>
            <span className="text-[11px] text-[#6b7280]">active high</span>
          </div>
        </div>

        {/* Completed */}
        <div className="p-3.5 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b] space-y-1">
          <div className="flex items-center gap-1.5 text-[#8f96a8] text-xs font-medium">
            <CheckCircle2 size={13} className="text-emerald-400" />
            <span>Completion Rate</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold font-mono text-[#f4f4f6]">
              {completedCount}/{tasks.length}
            </span>
            <span className="text-[11px] text-[#6b7280]">({progressPercent}%)</span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {tasks.length > 0 && (
        <div className="w-full bg-[#181a24] rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-[#707df7] to-emerald-400 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
