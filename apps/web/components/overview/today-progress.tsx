"use client";

import { Clock, Code, Globe, Coffee, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ActivitySummary } from "@repo/types";

interface TodayProgressProps {
  activity?: ActivitySummary;
}

function formatMinutes(seconds?: number): string {
  if (!seconds || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function TodayProgress({ activity }: TodayProgressProps) {
  const activeSec = activity?.activeTime ?? 15480; // 4h 18m default
  const codingSec = activity?.codingTime ?? 10080; // 2h 48m
  const browserSec = activity?.browserTime ?? 4320; // 1h 12m
  const idleSec = Math.max(0, activeSec - (codingSec + browserSec));

  const total = Math.max(activeSec, 1);
  const codingPercent = Math.round((codingSec / total) * 100);
  const browserPercent = Math.round((browserSec / total) * 100);
  const idlePercent = Math.max(0, 100 - codingPercent - browserPercent);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[#232733] bg-[#111319] p-5 flex flex-col gap-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8f96a8]">
            Today's Progress
          </span>
          <span className="text-[#4b5162]">•</span>
          <span className="text-xs text-[#9ca3af] font-medium">
            Time Distribution
          </span>
        </div>
        <Link
          href="/timeline"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#6b7280] hover:text-[#707df7] transition-colors"
        >
          View Timeline <ArrowUpRight size={12} />
        </Link>
      </div>

      {/* Progress Multi-segment Bar */}
      <div className="space-y-2.5">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#0c0d12] border border-[#1d212b] flex">
          <div
            style={{ width: `${codingPercent}%` }}
            className="h-full bg-[#707df7] transition-all duration-500"
            title={`Focused / Coding: ${codingPercent}%`}
          />
          <div
            style={{ width: `${browserPercent}%` }}
            className="h-full bg-slate-500 transition-all duration-500"
            title={`Research / Browser: ${browserPercent}%`}
          />
          <div
            style={{ width: `${idlePercent}%` }}
            className="h-full bg-[#272b38] transition-all duration-500"
            title={`Other / Idle: ${idlePercent}%`}
          />
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between text-[11px] text-[#8f96a8]">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#707df7]" />
            <span>Focused ({codingPercent}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            <span>Browser / Research ({browserPercent}%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#272b38]" />
            <span>Idle ({idlePercent}%)</span>
          </div>
        </div>
      </div>

      {/* Numerical breakdown row */}
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#1d212b]">
        <div className="flex flex-col p-2.5 rounded bg-[#0c0d12] border border-[#1d212b]">
          <span className="text-[10px] uppercase tracking-wider text-[#6b7280] flex items-center gap-1">
            <Code size={11} className="text-[#707df7]" /> Focused Time
          </span>
          <span className="text-base font-semibold text-[#f4f4f6] mt-0.5">
            {formatMinutes(codingSec)}
          </span>
        </div>

        <div className="flex flex-col p-2.5 rounded bg-[#0c0d12] border border-[#1d212b]">
          <span className="text-[10px] uppercase tracking-wider text-[#6b7280] flex items-center gap-1">
            <Globe size={11} className="text-slate-400" /> Browser Time
          </span>
          <span className="text-base font-semibold text-[#f4f4f6] mt-0.5">
            {formatMinutes(browserSec)}
          </span>
        </div>

        <div className="flex flex-col p-2.5 rounded bg-[#0c0d12] border border-[#1d212b]">
          <span className="text-[10px] uppercase tracking-wider text-[#6b7280] flex items-center gap-1">
            <Clock size={11} className="text-[#9ca3af]" /> Total Active
          </span>
          <span className="text-base font-semibold text-[#f4f4f6] mt-0.5">
            {formatMinutes(activeSec)}
          </span>
        </div>
      </div>
    </div>
  );
}
