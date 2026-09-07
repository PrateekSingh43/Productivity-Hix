"use client";

import React from "react";
import { Info, Database } from "lucide-react";

interface InsufficientDataStateProps {
  title?: string;
  description?: string;
  daysRecorded?: number;
  daysRequired?: number;
  dataPointName?: string;
  className?: string;
}

export function InsufficientDataState({
  title = "Insufficient Data for Pattern Synthesis",
  description = "Insights and patterns require reliable historical observation before synthesis can begin.",
  daysRecorded = 0,
  daysRequired = 7,
  dataPointName = "productive days",
  className = "",
}: InsufficientDataStateProps) {
  const percentage = Math.min(
    100,
    Math.round((daysRecorded / Math.max(1, daysRequired)) * 100)
  );

  return (
    <div
      role="region"
      aria-label={title}
      className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--background-card)] p-8 text-center flex flex-col items-center justify-center ${className}`}
    >
      <div className="w-10 h-10 rounded-md bg-[var(--background-subtle)] border border-[var(--border-subtle)] flex items-center justify-center mb-4 text-[var(--foreground-muted)]">
        <Database className="w-5 h-5 text-[var(--foreground-muted)]" aria-hidden="true" />
      </div>

      <h3 className="text-sm font-medium text-[var(--foreground-primary)] mb-1">
        {title}
      </h3>
      <p className="text-xs text-[var(--foreground-muted)] max-w-md leading-relaxed mb-6">
        {description}
      </p>

      {daysRequired > 0 && (
        <div className="w-full max-w-xs p-3 rounded-md bg-[var(--background-subtle)] border border-[var(--border-subtle)] text-left mb-2">
          <div className="flex items-center justify-between text-xs text-[var(--foreground-muted)] mb-2">
            <span>
              Observed: <strong className="text-[var(--foreground-primary)]">{daysRecorded}</strong> / {daysRequired} {dataPointName}
            </span>
            <span className="font-mono text-[11px]">{percentage}%</span>
          </div>
          <div className="w-full h-1.5 bg-[var(--background-primary)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--foreground-muted)] transition-all duration-300 rounded-full"
              style={{ width: `${percentage}%` }}
              role="progressbar"
              aria-valuenow={daysRecorded}
              aria-valuemin={0}
              aria-valuemax={daysRequired}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[var(--foreground-muted)]">
        <Info className="w-3.5 h-3.5" aria-hidden="true" />
        <span>No synthetic or modeled metrics are displayed. Real data only.</span>
      </div>
    </div>
  );
}
