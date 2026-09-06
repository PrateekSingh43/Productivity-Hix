"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useLiveTelemetry } from "../../src/hooks/use-live-telemetry";

interface TopHeaderProps {
  title: string;
  subtitle?: string;
}

export function TopHeader({ title, subtitle }: TopHeaderProps) {
  const telemetry = useLiveTelemetry();
  const currentDate = format(new Date(), "EEEE, MMMM d");

  const isConnected = telemetry.connected;
  const isRecentlyActive = telemetry.secondsAgo !== null && telemetry.secondsAgo < 15;

  return (
    <header className="h-14 border-b border-[#1e222b] bg-[#0d0e13] sticky top-0 z-30 shrink-0 select-none shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
      <div className="w-full max-w-[1600px] mx-auto px-6 sm:px-8 h-full flex items-center justify-between">
        {/* Left: Breadcrumbs / Title & Date */}
        <div className="flex items-center gap-2.5">
          <h1 className="text-[13px] font-semibold tracking-tight text-[#f4f4f6]">{title}</h1>
          <span className="text-[#4b5162] text-xs">/</span>
          <span className="text-xs text-[#8f96a8] font-normal">{subtitle || currentDate}</span>
        </div>

        {/* Right: Humanized Tracking Status */}
        <div className="flex items-center gap-3.5">
          {isConnected ? (
            <Link
              href="/devices"
              className="flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-sm)] bg-[#141720] border border-[#232733] text-xs font-medium text-[#9ca3af] hover:text-[#f4f4f6] hover:border-[#353b4d] transition-colors"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isRecentlyActive ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span>Desktop connected</span>
              {telemetry.secondsAgo !== null && (
                <span className="text-[10px] text-[#6b7280] font-mono">
                  {telemetry.secondsAgo === 0 ? "live" : `${telemetry.secondsAgo}s ago`}
                </span>
              )}
            </Link>
          ) : (
            <Link
              href="/devices"
              className="flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-sm)] bg-[#141720] border border-[#232733] text-xs font-medium text-[#6b7280] hover:text-[#f4f4f6] hover:border-[#353b4d] transition-colors"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#4b5162]" />
              <span>Desktop idle</span>
              <span className="text-[10px] text-[#707df7] hover:underline">Connect</span>
            </Link>
          )}

          {/* Small Profile Avatar */}
          <div className="h-6 w-6 rounded-full bg-[#1c1f28] border border-[#2d3240] flex items-center justify-center text-[10px] font-semibold text-[#f4f4f6]">
            P
          </div>
        </div>
      </div>
    </header>
  );
}
