/**
 * Focus target resolution for a live session.
 *
 * A session target is the duration the user chose for ONE execution block
 * and that the server persisted (`WorkSession.targetDurationMinutes`). It is
 * deliberately NOT the linked task's `plannedDurationMinutes` (that estimates
 * the whole task, a different concept) and it is never defaulted. A session
 * without a persisted target is OPEN-ENDED: no countdown, no overtime
 * calculation, no target-reached notification. Callers may still show the
 * elapsed count-up timer.
 */
export interface SessionTargetState {
  /** Persisted target in minutes, or null when the session is open-ended. */
  targetMinutes: number | null;
  /** Persisted target in seconds, or null when open-ended. */
  targetSeconds: number | null;
  /** targetSeconds - elapsedSeconds, or null when open-ended. */
  remainingSeconds: number | null;
  /** True only past the target (remaining < 0); "at target" is not overtime. */
  isOvertime: boolean;
}

export function resolveSessionTargetState(
  targetDurationMinutes: number | null | undefined,
  elapsedSeconds: number,
): SessionTargetState {
  const hasTarget =
    typeof targetDurationMinutes === "number" &&
    Number.isFinite(targetDurationMinutes) &&
    targetDurationMinutes > 0;
  if (!hasTarget) {
    return {
      targetMinutes: null,
      targetSeconds: null,
      remainingSeconds: null,
      isOvertime: false,
    };
  }
  const targetSeconds = targetDurationMinutes * 60;
  const remainingSeconds = targetSeconds - elapsedSeconds;
  return {
    targetMinutes: targetDurationMinutes,
    targetSeconds,
    remainingSeconds,
    isOvertime: remainingSeconds < 0,
  };
}
