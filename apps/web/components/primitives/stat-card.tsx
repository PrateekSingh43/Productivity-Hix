import React from "react";
import { AlertCircle, Clock } from "lucide-react";

export type StatCardState =
  | "ready"
  | "loading"
  | "empty"
  | "insufficient"
  | "error"
  | "unavailable";

interface StatCardProps {
  label: string;
  value?: React.ReactNode;
  subtext?: string;
  state?: StatCardState;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  action?: React.ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  subtext,
  state = "ready",
  icon: Icon,
  action,
  className = "",
}: StatCardProps) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-border-subtle bg-bg-card p-4 flex flex-col justify-between gap-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary truncate">
          {label}
        </span>
        {Icon && (
          <Icon size={14} className="text-text-tertiary shrink-0" aria-hidden="true" />
        )}
      </div>

      <div className="space-y-1">
        {state === "loading" && (
          <div className="h-7 w-20 bg-bg-tertiary rounded animate-pulse" aria-label="Loading metric" />
        )}

        {state === "ready" && (
          <div className="text-xl font-semibold tracking-tight text-text-primary">
            {value ?? "—"}
          </div>
        )}

        {state === "empty" && (
          <div className="text-xl font-semibold tracking-tight text-text-tertiary">
            {value ?? "0"}
          </div>
        )}

        {state === "insufficient" && (
          <div className="text-xs font-medium text-text-tertiary flex items-center gap-1.5 py-1">
            <Clock size={13} className="text-text-tertiary shrink-0" />
            <span>Collecting data</span>
          </div>
        )}

        {state === "error" && (
          <div className="text-xs font-medium text-error flex items-center gap-1.5 py-1">
            <AlertCircle size={13} className="shrink-0" />
            <span>Failed to load</span>
          </div>
        )}

        {state === "unavailable" && (
          <div className="text-xs font-medium text-text-tertiary py-1">
            Offline / Unavailable
          </div>
        )}

        {subtext && (
          <p className="text-[11px] text-text-tertiary leading-tight truncate">
            {subtext}
          </p>
        )}
      </div>

      {action && <div className="pt-1 border-t border-border-subtle/50">{action}</div>}
    </div>
  );
}
