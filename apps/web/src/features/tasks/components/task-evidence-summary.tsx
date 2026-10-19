"use client";

import { useMemo } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { useTaskEvidence } from "../api/queries";

interface SessionWindowInfo {
  startedAt: string;
  endedAt: string | null;
}

function pct(seconds: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((seconds / total) * 100);
}

/**
 * Slice C focused UI: evidence coverage, freshness, and attribution
 * provenance for a task's linked session windows.
 *
 * Honesty contract (R3/R7): the coverage strip counts atomic evidence blocks
 * (never overlapping sums); freshness is computed per request from committed
 * rows (no snapshot stale flag); losing or conflicting attribution signals
 * stay visible instead of being hidden.
 */
export function TaskEvidenceSummary({
  taskId,
  sessions,
}: {
  taskId: string;
  sessions: SessionWindowInfo[];
}) {
  const window = useMemo(() => {
    if (sessions.length === 0) return null;
    const starts = sessions.map((s) => new Date(s.startedAt).getTime());
    const ends = sessions.map((s) => (s.endedAt ? new Date(s.endedAt).getTime() : Date.now()));
    const from = new Date(Math.min(...starts));
    const to = new Date(Math.max(...ends));
    if (!(to.getTime() > from.getTime())) return null;
    return { from, to };
  }, [sessions]);

  const { data } = useTaskEvidence(taskId, window?.from ?? null, window?.to ?? null);
  if (!window || !data) return null;

  const summary = data.evidence.coverageSummary;
  const total = summary.totalDurationSeconds;

  // Session-original-task vs current context: a block whose session signal
  // points at a different task than the resolved intention means the live
  // context (or a correction) re-routed time that began under another task.
  const reRouted = new Set<string>();
  const conflicts = new Set<string>();
  for (const block of data.evidence.blocks) {
    for (const signal of block.provenance) {
      if (signal.role === "CONFLICTING") {
        const target = signal.targetTaskTitle ?? "no task";
        conflicts.add(`${signal.source.replace(/_/g, " ")} → ${target}`);
      }
      if (
        signal.source === "work_session" &&
        signal.targetTaskId &&
        block.intention?.taskId &&
        signal.targetTaskId !== block.intention.taskId
      ) {
        reRouted.add(
          `Session began under ${signal.targetTaskTitle ?? "another task"}; attributed to ${
            block.intention.taskTitle ?? "another task"
          }`,
        );
      }
    }
  }

  const fresh = `Built ${formatDistanceToNowStrict(new Date(data.freshness.computedAt))} ago from committed data`;
  const telemetry = data.freshness.telemetryThrough
    ? `telemetry through ${format(new Date(data.freshness.telemetryThrough), "MMM d, h:mm a")}`
    : "no telemetry in window";

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center gap-2">
        <ShieldCheck size={13} className="text-text-muted" />
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Evidence coverage
        </h3>
      </div>

      <div className="p-4 rounded-xl bg-bg-secondary/30 border border-border-subtle space-y-3">
        <p className="text-xs text-text-muted leading-relaxed">
          Atomic evidence blocks over the full range spanned by this task&apos;s
          linked sessions — including gaps between them, which an open work
          context can keep attributed. Intent says what was meant to happen;
          observation says what telemetry saw — an intent never counts as proof.
        </p>

        <div className="flex items-center gap-3 text-[11px] font-mono text-text-secondary">
          <span
            className="inline-flex items-center gap-1.5"
            title="Telemetry-observed time; includes intervals that also carry a user report (OBSERVED_REPORTED)."
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500/70" />
            {pct(summary.observedSeconds + summary.observedReportedSeconds, total)}% observed
          </span>
          <span
            className="inline-flex items-center gap-1.5"
            title="User-reported coverage without telemetry (check-in or gap explanation). Report is not proof of work."
          >
            <span className="h-2 w-2 rounded-full bg-sky-500/70" />
            {pct(summary.reportedSeconds, total)}% reported
          </span>
          <span
            className="inline-flex items-center gap-1.5"
            title="User explained a telemetry gap; no telemetry observed in this time."
          >
            <span className="h-2 w-2 rounded-full bg-amber-500/70" />
            {pct(summary.explainedGapSeconds, total)}% explained gap
          </span>
          <span className="inline-flex items-center gap-1.5" title="No signal of any kind.">
            <span className="h-2 w-2 rounded-full bg-text-muted/40" />
            {pct(summary.unknownSeconds, total)}% unknown
          </span>
        </div>

        {(reRouted.size > 0 || conflicts.size > 0) && (
          <div className="space-y-1 border-t border-border-subtle/30 pt-2">
            {[...reRouted].map((line) => (
              <p key={line} className="text-[11px] text-text-muted leading-relaxed">
                {line}. The session keeps its original task — both facts stay visible.
              </p>
            ))}
            {conflicts.size > 0 && (
              <p className="text-[11px] text-text-muted leading-relaxed">
                Signals disagree: {[...conflicts].join("; ")}.
              </p>
            )}
          </div>
        )}

        <p className="text-[10px] text-text-muted font-mono">
          {fresh} · {telemetry}
        </p>
      </div>
    </div>
  );
}
