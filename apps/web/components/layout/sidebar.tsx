"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Calendar,
  Clock,
  CheckSquare,
  Timer,
  BookOpen,
  RotateCcw,
  LineChart,
  Network,
  Laptop,
  Settings,
  Zap,
} from "lucide-react";
import { useLiveTelemetry } from "../../src/hooks/use-live-telemetry";

interface NavGroup {
  title: string;
  items: Array<{
    href: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    badge?: string;
    isLiveDevice?: boolean;
  }>;
}

const navGroups: NavGroup[] = [
  {
    title: "MAIN",
    items: [
      { href: "/", label: "Home", icon: Compass },
      { href: "/today", label: "Today", icon: Calendar },
    ],
  },
  {
    title: "WORK",
    items: [
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/sessions", label: "Sessions", icon: Timer },
    ],
  },
  {
    title: "LEARNING",
    items: [
      { href: "/learning", label: "Learning", icon: BookOpen },
      { href: "/review", label: "Review", icon: RotateCcw },
    ],
  },
  {
    title: "UNDERSTAND",
    items: [
      { href: "/timeline", label: "Timeline", icon: Clock },
      { href: "/insights", label: "Insights", icon: LineChart },
      { href: "/patterns", label: "Patterns", icon: Network },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { href: "/devices", label: "Devices", icon: Laptop, isLiveDevice: true },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const telemetry = useLiveTelemetry();

  // Honest connection indicator: true only if WebSocket is live
  const isDeviceConnected = telemetry.connected;

  return (
    <aside
      className="w-[240px] border-r border-border-default bg-bg-inset flex flex-col h-screen sticky top-0 shrink-0 select-none z-20"
      aria-label="Application Navigation"
    >
      {/* Brand Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-border-subtle">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-6 w-6 rounded-[var(--radius-sm)] overflow-hidden flex items-center justify-center transition-transform group-hover:scale-105">
            <img src="/icon.png" alt="ProductiveHix" className="w-5 h-5 rounded-[var(--radius-sm)] object-contain" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-text-primary">
            ProductiveHix
          </span>
        </Link>
        <span className="text-[10px] font-mono text-text-tertiary bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle">
          v1.3
        </span>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 px-2.5 py-3 space-y-4 overflow-y-auto" aria-label="Main Navigation">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-0.5">
            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              {group.title}
            </div>
            {group.items.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex items-center justify-between rounded-[var(--radius-md)] px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                    isActive
                      ? "bg-bg-tertiary text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                      : "text-text-secondary hover:bg-bg-secondary/80 hover:text-text-primary"
                  }`}
                >
                  {/* Left accent indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-[2px] rounded-r-full bg-accent-default" />
                  )}

                  <div className="flex items-center gap-2.5 truncate">
                    <Icon
                      size={15}
                      className={`shrink-0 transition-colors ${
                        isActive
                          ? "text-accent-default"
                          : "text-text-tertiary group-hover:text-text-secondary"
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {/* Device live status dot or badge */}
                  {item.isLiveDevice ? (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isDeviceConnected ? "bg-success" : "bg-text-tertiary/60"
                      }`}
                      title={
                        isDeviceConnected
                          ? "Desktop telemetry bridge connected"
                          : "Desktop telemetry bridge offline"
                      }
                    />
                  ) : item.badge ? (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-accent-subtle text-accent-default border border-accent-default/20">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom Profile / Quick Status */}
      <div className="p-3 border-t border-border-subtle bg-bg-inset">
        <div className="flex items-center justify-between px-1.5 py-1">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-bg-tertiary border border-border-strong flex items-center justify-center text-[11px] font-semibold text-text-primary">
              P
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-medium text-text-primary">Prateek</span>
              <span className="text-[10px] text-text-tertiary">Personal OS</span>
            </div>
          </div>
          <Link
            href="/settings"
            className="text-text-tertiary hover:text-text-primary transition-colors p-1 rounded hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-default"
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={14} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
