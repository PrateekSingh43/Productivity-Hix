"use client";

import { Laptop, Globe, Clock } from "lucide-react";
import { useLiveTelemetry } from "../../src/hooks/use-live-telemetry";

export function LiveActivityCard() {
  const telemetry = useLiveTelemetry();

  const isConnected = telemetry.connected;
  const isAfk = telemetry.isAfk;
  const app = telemetry.activeApp || "Visual Studio Code";
  const windowTitle = telemetry.windowTitle || "ProductiveHix — Overview Refactor";
  const domain = telemetry.activeDomain;
  const tabTitle = telemetry.activeTabTitle;

  const secondsAgo = telemetry.secondsAgo;
  const timeString =
    secondsAgo !== null
      ? secondsAgo < 5
        ? "Active now"
        : `${secondsAgo}s ago`
      : "Monitoring";

  return (
    <div className="rounded-[var(--radius-lg)] border border-[#232733] bg-[#111319] p-5 flex flex-col justify-between gap-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
      {/* Top status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8f96a8]">
            Live Activity
          </span>
          <span className="text-[#4b5162]">•</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-[#9ca3af] font-medium">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isAfk
                  ? "bg-amber-400"
                  : isConnected
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-[#6b7280]"
              }`}
            />
            {isAfk ? "Idle" : isConnected ? "Tracking" : "Connecting..."}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-[#6b7280] font-mono">
          <Clock size={12} />
          <span>{timeString}</span>
        </div>
      </div>

      {/* Main Activity Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Desktop context */}
        <div className="flex flex-col gap-1 p-3.5 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b]">
          <div className="flex items-center justify-between text-[#6b7280]">
            <span className="text-[10px] font-medium uppercase tracking-wider flex items-center gap-1.5">
              <Laptop size={12} className="text-[#9ca3af]" /> Desktop
            </span>
            <span className="text-[10px] text-[#6b7280] font-mono">Window</span>
          </div>
          <span className="text-xs font-semibold text-[#f4f4f6] truncate mt-0.5">
            {app}
          </span>
          <span className="text-[11px] text-[#9ca3af] truncate" title={windowTitle}>
            {windowTitle}
          </span>
        </div>

        {/* Browser context */}
        <div className="flex flex-col gap-1 p-3.5 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b]">
          <div className="flex items-center justify-between text-[#6b7280]">
            <span className="text-[10px] font-medium uppercase tracking-wider flex items-center gap-1.5">
              <Globe size={12} className="text-[#9ca3af]" /> Browser
            </span>
            <span className="text-[10px] text-[#6b7280] font-mono">Web</span>
          </div>
          <span className="text-xs font-semibold text-[#f4f4f6] truncate mt-0.5">
            {domain || "React Query Docs"}
          </span>
          <span className="text-[11px] text-[#9ca3af] truncate" title={tabTitle || "TanStack React Query v5"}>
            {tabTitle || "TanStack React Query v5 Overview"}
          </span>
        </div>
      </div>

      {/* Bottom humanized summary */}
      <div className="flex items-center justify-between text-[11px] text-[#6b7280] pt-2.5 border-t border-[#1d212b]">
        <span>
          Context switches today: <span className="text-[#9ca3af] font-medium">14</span>
        </span>
        <span className="text-[#707df7] font-medium">
          Current focus: High
        </span>
      </div>
    </div>
  );
}
