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
  const isRecentlyActive =
    telemetry.secondsAgo !== null && telemetry.secondsAgo < 15;

  return (
    <header className="h-14 border-b border-[var(--border-subtle)] bg-[var(--background-card)] sticky top-0 z-30 shrink-0 select-none">
      <div className="w-full max-w-[1600px] mx-auto px-6 sm:px-8 h-full flex items-center justify-between">
        {/* Left: Breadcrumbs / Title & Date */}
        <div className="flex items-center gap-2.5">
          <h1 className="text-[13px] font-semibold tracking-tight text-[var(--foreground-primary)]">
            {title}
          </h1>
          <span className="text-[var(--foreground-muted)] text-xs">/</span>
          <span className="text-xs text-[var(--foreground-muted)] font-normal">
            {subtitle || currentDate}
          </span>
        </div>

        {/* Right: Honest Collector Connectivity Status */}
        <div className="flex items-center gap-3.5">
          {isConnected ? (
            <Link
              href="/devices"
              className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--background-subtle)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--foreground-primary)] hover:border-[var(--foreground-muted)] transition-colors"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isRecentlyActive ? "bg-emerald-400" : "bg-emerald-500/60"
                }`}
              />
              <span>Desktop connected</span>
              {telemetry.secondsAgo !== null && (
                <span className="text-[10px] text-[var(--foreground-muted)] font-mono">
                  {telemetry.secondsAgo === 0
                    ? "live"
                    : `${telemetry.secondsAgo}s ago`}
                </span>
              )}
            </Link>
          ) : (
            <Link
              href="/devices"
              className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--background-subtle)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground-primary)] transition-colors"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
              <span>Desktop watcher offline</span>
              <span className="text-[10px] text-[var(--accent-primary)] hover:underline ml-1">
                Connect
              </span>
            </Link>
          )}

          {/* User Identifier */}
          <div className="h-6 w-6 rounded-full bg-[var(--background-subtle)] border border-[var(--border-subtle)] flex items-center justify-center text-[10px] font-semibold text-[var(--foreground-primary)]">
            P
          </div>
        </div>
      </div>
    </header>
  );
}
