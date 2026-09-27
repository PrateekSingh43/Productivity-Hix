"use client";

import { useState } from "react";
import { format } from "date-fns";
import { History } from "lucide-react";
import {
  useAmendCheckInMutation,
  useCheckInAmendments,
  useCreateCheckInMutation,
} from "@features/sessions";

const ASSESSMENTS = [
  { id: "deep_focus", label: "Deep Flow" },
  { id: "useful_not_productive", label: "Good Progress" },
  { id: "distracted", label: "Distracted" },
  { id: "blocked", label: "Blocked" },
] as const;

const ENERGIES = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
] as const;

export interface ComposerCheckIn {
  id: string;
  activityAssessment?: string | null;
  energy?: string | null;
  outcome?: string | null;
  note?: string | null;
  amendmentCount?: number;
}

interface SessionReflectionComposerProps {
  mode: "create" | "amend";
  sessionId?: string;
  taskId?: string | null;
  taskTitle?: string | null;
  checkIn?: ComposerCheckIn | null;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Inline reflection composer for the task drawer (no modal).
 *
 * - create: late-entry debrief for a past session that has none. Saved with
 *   source `web_focus_late` so the UI (and AI) can see it was written after
 *   the fact instead of in the moment.
 * - amend: revises an existing debrief. The server snapshots the prior
 *   version into the append-only amendments table first, so the raw
 *   original is never silently overwritten.
 */
export function SessionReflectionComposer({
  mode,
  sessionId,
  taskId,
  taskTitle,
  checkIn,
  onDone,
  onCancel,
}: SessionReflectionComposerProps) {
  const createMutation = useCreateCheckInMutation();
  const amendMutation = useAmendCheckInMutation();
  const pending = createMutation.isPending || amendMutation.isPending;

  const [assessment, setAssessment] = useState<string>(
    (mode === "amend" && checkIn?.activityAssessment) || "deep_focus"
  );
  const [energy, setEnergy] = useState<string>(
    (mode === "amend" && checkIn?.energy) || "medium"
  );
  const [outcome, setOutcome] = useState<string>(
    mode === "amend" ? checkIn?.outcome || checkIn?.note || "" : ""
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    try {
      if (mode === "create") {
        if (!sessionId) throw new Error("Missing session");
        await createMutation.mutateAsync({
          workSessionId: sessionId,
          taskId: taskId || null,
          intent: taskTitle ? `Focus on ${taskTitle}` : "Late focus reflection",
          activityAssessment: assessment,
          energy,
          productive: assessment === "deep_focus" || assessment === "useful_not_productive",
          progress: assessment !== "blocked",
          blocker: assessment === "blocked" ? outcome.trim() || "Blocked during session" : null,
          outcome: outcome.trim() || null,
          source: "web_focus_late",
        });
      } else {
        if (!checkIn) throw new Error("Missing reflection");
        await amendMutation.mutateAsync({
          id: checkIn.id,
          input: {
            activityAssessment: assessment,
            energy,
            outcome: outcome.trim() || null,
            blocker: assessment === "blocked" ? outcome.trim() || "Blocked during session" : null,
          },
        });
      }
      onDone();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save. Your text above is preserved — try again."
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border-subtle bg-bg-card p-3 space-y-2.5"
    >
      <div className="flex flex-wrap gap-1.5">
        {ASSESSMENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAssessment(a.id)}
            className={`px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
              assessment === a.id
                ? "bg-text-primary text-bg-default border-text-primary"
                : "bg-bg-secondary text-text-muted border-border-subtle hover:text-text-primary hover:border-border-hover"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <textarea
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="What did you actually get done?"
        className="w-full rounded-md border border-border-subtle bg-bg-secondary/40 px-2.5 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover resize-y"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-text-muted mr-0.5">Energy</span>
          {ENERGIES.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEnergy(e.id)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                energy === e.id
                  ? "bg-bg-secondary text-text-primary border-border-strong"
                  : "text-text-muted border-transparent hover:text-text-primary"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="px-3 py-1 rounded-md text-[11px] font-semibold bg-text-primary text-bg-default hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
          >
            {pending ? "Saving…" : mode === "create" ? "Save reflection" : "Save changes"}
          </button>
        </div>
      </div>

      {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}

      <p className="text-[10px] text-text-muted leading-relaxed">
        {mode === "create"
          ? "Saved as “added later” — the honest timestamp is kept."
          : "Your original wording is preserved below — corrections never overwrite it."}
      </p>
    </form>
  );
}

/**
 * Collapsed prior-version history for an amended reflection (oldest-first).
 * Rendered only when amendmentCount > 0.
 */
export function ReflectionAmendmentHistory({ checkInId }: { checkInId: string }) {
  const { data: amendments = [], isLoading } = useCheckInAmendments(checkInId);
  const [open, setOpen] = useState(false);

  if (!isLoading && amendments.length === 0) return null;

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
      >
        <History size={11} />
        <span>
          {open ? "Hide" : "View"} earlier version{amendments.length === 1 ? "" : "s"} ({amendments.length})
        </span>
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5">
          {amendments.map((a) => (
            <div
              key={a.id}
              className="rounded-md border border-dashed border-border-subtle bg-bg-secondary/30 px-2.5 py-2 space-y-1"
            >
              <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted">
                <span>{format(new Date(a.createdAt), "MMM d, h:mm a")}</span>
                {a.activityAssessment && <span>· {a.activityAssessment}</span>}
                {a.energy && <span>· energy {a.energy}</span>}
              </div>
              {(a.outcome || a.note) && (
                <p className="text-[11px] text-text-secondary leading-relaxed">{a.outcome || a.note}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
