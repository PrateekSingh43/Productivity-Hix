"use client";

import React from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      role="region"
      aria-label={title}
      className={`flex flex-col items-center justify-center p-8 md:p-12 text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] transition-colors ${className}`}
    >
      {Icon && (
        <div className="w-10 h-10 rounded-md bg-[var(--background-subtle)] border border-[var(--border-subtle)] flex items-center justify-center mb-4 text-[var(--foreground-muted)]">
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-sm font-medium text-[var(--foreground-primary)] mb-1">
        {title}
      </h3>
      <p className="text-xs text-[var(--foreground-muted)] max-w-sm leading-relaxed mb-4">
        {description}
      </p>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
