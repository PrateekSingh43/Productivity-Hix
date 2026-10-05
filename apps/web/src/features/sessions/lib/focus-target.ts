/**
 * Explicit focus target for starting a deliberate session.
 *
 * A session is ALWAYS one of:
 * - explicitly linked to a task (`task`), or
 * - explicitly independent (`independent`) with a free-text topic.
 *
 * There is intentionally no "whatever task happens to be selected" state.
 * Local task selection must be converted into a FocusTarget at the moment
 * the user commits to starting — never read implicitly at start time.
 *
 * Domain notes:
 * - `topic` is the user's stated intention for an independent block. An
 *   empty topic persists as `notes: null` (never synthesize placeholder
 *   text into the stored session).
 * - Duration here is the SESSION target chosen at start. It is NOT the
 *   task's `plannedDurationMinutes`. Callers may suggest the task plan as
 *   an initial picker value, but what is stored is what the user set.
 */
export type FocusTarget =
  | {
      kind: "task";
      taskId: string;
    }
  | {
      kind: "independent";
      topic: string;
    };

export interface FocusStartPayload {
  taskId: string | null;
  notes: string | null;
  targetDurationMinutes: number | null;
}

/**
 * Builds the `POST /api/sessions` payload from an explicit FocusTarget.
 *
 * Truthfulness rules (Zero Fake Data):
 * - taskId comes ONLY from a `task` target. Independent targets always
 *   yield `taskId: null`, even if some task is selected elsewhere in UI.
 * - notes come ONLY from caller-supplied text (trimmed). Empty stays null.
 * - targetDurationMinutes comes ONLY from the explicit argument. Omitted or
 *   non-positive stays null so history can honestly render "Target not set".
 *
 * @param target Explicit focus target chosen by the user.
 * @param durationMinutes Session target in minutes, or null/undefined for none.
 * @param notes Optional caller-supplied notes (task flows may pass none).
 */
export function resolveFocusPayload(
  target: FocusTarget,
  durationMinutes?: number | null,
  notes?: string | null,
): FocusStartPayload {
  const trimmedTopic = target.kind === "independent" ? target.topic.trim() : "";
  const trimmedNotes = (notes ?? (target.kind === "independent" ? trimmedTopic : "")).trim();
  return {
    taskId: target.kind === "task" ? target.taskId : null,
    notes: trimmedNotes ? trimmedNotes : null,
    targetDurationMinutes:
      typeof durationMinutes === "number" && durationMinutes > 0 ? durationMinutes : null,
  };
}
