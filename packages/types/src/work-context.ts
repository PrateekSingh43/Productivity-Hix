/**
 * Phase 1 WorkContext contract (R2/R5).
 *
 * A WorkContext is a system-maintained, append-only record of "what the user
 * was working on" during a time range. It is the stronger, structured sibling
 * of WorkSession task links: switching context ends the previous row and opens
 * a new one (SWITCHED), never mutating history.
 *
 * Open contexts (`endedAt === null`) are closed by SESSION_ASSOCIATED,
 * USER_ENDED, or STALE_RECOVERY. At most one open context per user exists
 * (enforced by a partial unique index in the database layer, R5).
 */
export type WorkContextEndedReason =
  | "SWITCHED"
  | "SESSION_ASSOCIATED"
  | "USER_ENDED"
  | "STALE_RECOVERY";

export interface WorkContext {
  id: string;
  userId: string;
  taskId: string | null;
  goalId: string | null;
  startedAt: string;
  endedAt: string | null;
  startedBySessionId: string | null;
  endedReason: WorkContextEndedReason | null;
}

/**
 * Phase 1 AttributionCorrection contract (R1).
 *
 * Append-only user correction of attribution for a time window. Corrections
 * are never edited or deleted: a newer correction supersedes an older one by
 * setting `supersedesCorrectionId` (informational, backward-looking). When
 * multiple corrections overlap the same atomic interval, the latest wins by
 * `(createdAt, id)`. `targetKind: "NONE"` asserts "this time belongs to no
 * task" and is projected to an EXPLICIT UNLINKED intention.
 */
export type AttributionTargetKind = "TASK" | "NONE";

export interface AttributionCorrection {
  id: string;
  userId: string;
  windowStart: string;
  windowEnd: string;
  targetKind: AttributionTargetKind;
  taskId: string | null;
  taskTitleSnapshot: string | null;
  reason: string | null;
  supersedesCorrectionId: string | null;
  createdAt: string;
}
