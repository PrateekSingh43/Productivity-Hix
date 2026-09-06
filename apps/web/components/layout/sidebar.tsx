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
    title: "OVERVIEW",
    items: [
      { href: "/", label: "Overview", icon: Compass },
      { href: "/today", label: "Today", icon: Calendar },
      { href: "/timeline", label: "Timeline", icon: Clock },
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
      { href: "/review", label: "Review", icon: RotateCcw, badge: "2 due" },
    ],
  },
  {
    title: "INSIGHTS",
    items: [
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

  const isDeviceActive = telemetry.connected || (telemetry.secondsAgo !== null && telemetry.secondsAgo < 15);

  return (
    <aside className="w-[248px] border-r border-border-default bg-bg-inset flex flex-col h-screen sticky top-0 shrink-0 select-none z-20">
      {/* Brand Header */}
      <div className="h-14 px-5 flex items-center justify-between border-b border-border-subtle">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-6 w-6 rounded-[var(--radius-sm)] bg-accent-default/15 text-accent-default border border-accent-default/30 flex items-center justify-center transition-colors group-hover:bg-accent-default/25">
            <Zap size={13} className="fill-current" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-text-primary">ProductiveHix</span>
          </div>
        </Link>
        <span className="text-[10px] font-mono text-text-tertiary bg-bg-secondary px-1.5 py-0.5 rounded border border-border-subtle">
          v0.2
        </span>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 px-2.5 py-4 space-y-5 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              {group.title}
            </div>
            {group.items.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex items-center justify-between rounded-[var(--radius-md)] px-2.5 py-1.5 text-[13px] font-medium transition-all ${
                    isActive
                      ? "bg-bg-tertiary text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                      : "text-text-secondary hover:bg-bg-secondary/80 hover:text-text-primary"
                  }`}
                >
                  {/* Left violet indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-[2.5px] rounded-r-full bg-accent-default" />
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
                        isDeviceActive ? "bg-success animate-pulse" : "bg-text-tertiary"
                      }`}
                      title={isDeviceActive ? "Desktop tracking connected" : "Desktop idle"}
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
      </div>

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
            className="text-text-tertiary hover:text-text-primary transition-colors p-1 rounded hover:bg-bg-secondary"
            title="Settings"
          >
            <Settings size={14} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
