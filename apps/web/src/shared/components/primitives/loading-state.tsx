"use client";

import React from "react";
import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  label?: string;
  className?: string;
}

export function LoadingState({
  label = "Loading data...",
  className = "",
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center p-12 text-center rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] ${className}`}
    >
      <Loader2
        className="w-5 h-5 animate-spin text-[var(--foreground-muted)] mb-3"
        aria-hidden="true"
      />
      <span className="text-xs text-[var(--foreground-muted)] font-mono">
        {label}
      </span>
    </div>
  );
}
