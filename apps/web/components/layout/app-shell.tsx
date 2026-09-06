"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Settings, Zap } from "lucide-react";
import { Sidebar } from "./sidebar";
import { useLiveTelemetry } from "../../src/hooks/use-live-telemetry";

const titles: Record<string, string> = {
  "/": "Overview",
  "/today": "Today",
  "/timeline": "Timeline",
  "/tasks": "Tasks",
  "/sessions": "Sessions",
  "/learning": "Learning",
  "/review": "Review",
  "/insights": "Insights",
  "/patterns": "Patterns",
  "/devices": "Devices",
  "/settings": "Settings",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const telemetry = useLiveTelemetry();
  const title = titles[pathname] ?? "ProductiveHix";
  const recentlyActive = telemetry.secondsAgo !== null && telemetry.secondsAgo < 15;

  return (
    <div className="flex h-screen overflow-hidden bg-bg-default text-text-primary">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="min-w-0 flex-1 flex flex-col overflow-hidden">
        <header className="sticky top-0 z-30 h-16 shrink-0 border-b border-border-subtle bg-bg-default/85 px-4 backdrop-blur-xl sm:px-6 xl:px-10">
          <div className="mx-auto flex h-full w-full max-w-[1440px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" className="flex items-center gap-2 lg:hidden">
                <span className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] border border-accent-default/30 bg-accent-default/15 text-accent-default">
                  <Zap size={15} fill="currentColor" />
                </span>
                <span className="text-sm font-semibold tracking-tight">ProductiveHix</span>
              </Link>
              <div className="hidden h-5 w-px bg-border-subtle lg:block" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight text-text-primary">{title}</p>
                <p className="hidden text-[11px] text-text-tertiary sm:block">Your personal operating system</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <Link
                href="/devices"
                className="inline-flex items-center gap-2 rounded-full border border-border-default bg-bg-secondary px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:border-border-strong hover:text-text-primary"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${recentlyActive ? "bg-success shadow-[0_0_10px_rgba(82,211,151,0.75)]" : "bg-text-tertiary"}`} />
                <span className="hidden sm:inline">{telemetry.connected ? "Tracking connected" : "Tracking idle"}</span>
                <Activity size={13} className="sm:hidden" />
              </Link>
              <Link
                href="/settings"
                className="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-text-tertiary hover:bg-bg-secondary hover:text-text-primary"
                aria-label="Open settings"
              >
                <Settings size={15} />
              </Link>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 xl:px-10">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
