"use client";

import type { PatternReadiness } from "../types";

interface Stage {
  key: keyof PatternReadiness;
  label: string;
  met: string;
  unmet: string;
}

const STAGES: Stage[] = [
  { key: "activity", label: "Activity", met: "Activity recorded", unmet: "No activity recorded" },
  { key: "evidence", label: "Evidence", met: "Comparable evidence", unmet: "Evidence not established" },
  { key: "analysis", label: "Analysis", met: "Analysis completed", unmet: "Analysis not run" },
  { key: "patterns", label: "Patterns", met: "Qualified patterns", unmet: "No qualified patterns" },
];

function stageVisual(stage: keyof PatternReadiness, value: string): { mark: string; active: boolean } {
  switch (stage) {
    case "activity":
      return value === "recorded" ? { mark: "✓", active: true } : { mark: "○", active: false };
    case "evidence":
      if (value === "sufficient") return { mark: "✓", active: true };
      if (value === "insufficient") return { mark: "→", active: false };
      return { mark: "○", active: false };
    case "analysis":
      if (value === "completed") return { mark: "✓", active: true };
      if (value === "running") return { mark: "→", active: true };
      if (value === "failed") return { mark: "!", active: true };
      return { mark: "○", active: false };
    case "patterns":
      return value === "found" ? { mark: "✓", active: true } : { mark: "○", active: false };
  }
}

/**
 * Secondary analytical-readiness indicator (§8).
 * Four discrete stages derived from actual system state — never a percentage,
 * never a promise of progress toward a pattern.
 */
export function ReadinessStrip({ readiness }: { readiness?: PatternReadiness }) {
  if (!readiness) return null;
  return (
    <section aria-label="Pattern analysis readiness" className="rounded-xl border border-border-subtle bg-bg-card p-4 sm:p-5">
      <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">Analysis readiness</h2>
      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STAGES.map(({ key, label, met, unmet }) => {
          const value = readiness[key];
          const visual = stageVisual(key, value);
          const done = visual.mark === "✓";
          return (
            <li
              key={key}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                visual.active ? "border-border-subtle text-text-primary" : "border-border-subtle text-text-muted"
              }`}
            >
              <span aria-hidden="true">{visual.mark}</span>
              <span>
                <span className="block text-xs text-text-muted">{label}</span>
                <span className="block text-xs">{done ? met : unmet}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
