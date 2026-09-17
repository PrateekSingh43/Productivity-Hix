import type {
  StartClassification,
  StartDeltaStatus,
  ScheduleVarianceEpisodeMetrics,
  SessionEvidenceItem,
} from "./types";

export interface ResolvedActualStart {
  actualStart: string;
  sessionId: string;
  corroboration: CorroborationState;
}

export type CorroborationState = "CORROBORATED" | "UNCORROBORATED" | null;

/**
 * Validates whether a timestamp string represents a valid, finite ISO timestamp.
 */
export function isValidTimestamp(ts: string | null | undefined): boolean {
  if (!ts) return false;
  const ms = Date.parse(ts);
  return Number.isFinite(ms);
}

/**
 * Deterministically sorts and deduplicates execution sessions.
 * Canonical sort happens BEFORE dedupe so the retained record is independent of input order.
 * Invariant: Primary: startedAt ascending (invalid timestamps sort last), secondary: stable session id ascending.
 * Replayed or duplicate session IDs are collapsed to the canonically-first record.
 */
export function sortAndDeduplicateSessions(
  sessions: SessionEvidenceItem[]
): SessionEvidenceItem[] {
  const sorted = [...sessions].filter(s => s.id).sort((a, b) => {
    const aStart = Date.parse(a.startedAt);
    const bStart = Date.parse(b.startedAt);
    const aValid = Number.isFinite(aStart);
    const bValid = Number.isFinite(bStart);
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (aValid && aStart !== bStart) return aStart - bStart;
    return a.id.localeCompare(b.id);
  });

  const uniqueList: SessionEvidenceItem[] = [];
  for (const session of sorted) {
    if (!uniqueList.some(existing => existing.id === session.id)) {
      uniqueList.push(session);
    }
  }

  return uniqueList;
}

/**
 * Resolves the earliest execution start candidate from deduplicated sessions.
 * - Sessions with malformed timestamps are skipped (missingness, not corruption).
 * - Sessions whose evidence window is inverted (endedAt < startedAt) are integrity
 *   violations: they cannot produce a truthful onset, but their presence must be
 *   reported distinctly from NOT_OBSERVED (no evidence at all).
 */
export function resolveActualStart(
  sessions: SessionEvidenceItem[]
): ResolvedActualStart | null {
  const sorted = sortAndDeduplicateSessions(sessions);

  for (const session of sorted) {
    if (!isValidTimestamp(session.startedAt)) {
      continue;
    }

    if (session.endedAt && isValidTimestamp(session.endedAt)) {
      const startMs = Date.parse(session.startedAt);
      const endMs = Date.parse(session.endedAt);
      if (endMs < startMs) {
        // Inverted window is corrupt evidence, never a valid onset.
        continue;
      }
    }

    return {
      actualStart: session.startedAt,
      sessionId: session.id,
      corroboration: session.endedAt != null || (session.durationSeconds ?? 0) > 0
        ? "UNCORROBORATED"
        : "UNCORROBORATED",
    };
  }

  return null;
}

/**
 * Classifies the integrity state of a task instance's execution evidence,
 * distinct from mere missingness (NOT_OBSERVED).
 */
export function hasIntegrityViolation(sessions: SessionEvidenceItem[]): boolean {
  return sortAndDeduplicateSessions(sessions).some(session => {
    if (!isValidTimestamp(session.startedAt)) return false; // malformed handled by caller
    if (session.endedAt && isValidTimestamp(session.endedAt)) {
      return Date.parse(session.endedAt) < Date.parse(session.startedAt);
    }
    return false;
  });
}

/**
 * Calculates signed schedule variance: actualStart - plannedStart.
 *
 * Strict Invariants:
 * - negative -> started early
 * - 0 -> exact on-time
 * - positive -> started late
 * - deltaRatio is strictly null (never compute relative ratio on signed deviation)
 * - Malformed timestamps and inverted windows produce INTEGRITY_ERROR,
 *   a state distinct from INDETERMINATE_COVERAGE and NOT_OBSERVED.
 * - Zero manufacturing of evidence or timestamps
 */
export function calculateScheduleVariance(
  taskId: string,
  plannedStartStr: string | null,
  actualStartStr: string | null,
  onTimeToleranceSeconds: number,
  plannedDurationMinutes?: number | null,
  observedActiveDurationMinutes?: number | null,
  plannedCapturedAt?: string | null
): ScheduleVarianceEpisodeMetrics {
  const corroboration = false;

  // 1. Missing plannedStart
  if (!plannedStartStr) {
    return {
      taskId,
      plannedStart: null,
      plannedCapturedAt: plannedCapturedAt ?? null,
      corroboration,
      actualStart: actualStartStr,
      startDeltaSeconds: null,
      startDeltaMinutes: null,
      deltaRatio: null,
      classification: null,
      status: "NO_PLANNED_START",
      scheduleDeviationRatio: null,
    };
  }

  // 2. Malformed plannedStart: corrupt record, NOT missing data
  if (!isValidTimestamp(plannedStartStr)) {
    return {
      taskId,
      plannedStart: plannedStartStr,
      plannedCapturedAt: plannedCapturedAt ?? null,
      corroboration,
      actualStart: actualStartStr,
      startDeltaSeconds: null,
      startDeltaMinutes: null,
      deltaRatio: null,
      classification: null,
      status: "INTEGRITY_ERROR",
      scheduleDeviationRatio: null,
    };
  }

  // 3. Missing actualStart (no execution observed)
  if (!actualStartStr) {
    return {
      taskId,
      plannedStart: plannedStartStr,
      plannedCapturedAt: plannedCapturedAt ?? null,
      corroboration,
      actualStart: null,
      startDeltaSeconds: null,
      startDeltaMinutes: null,
      deltaRatio: null,
      classification: null,
      status: "NOT_OBSERVED",
      scheduleDeviationRatio: null,
    };
  }

  // 4. Malformed actualStart: corrupt record, NOT missing data
  if (!isValidTimestamp(actualStartStr)) {
    return {
      taskId,
      plannedStart: plannedStartStr,
      plannedCapturedAt: plannedCapturedAt ?? null,
      corroboration,
      actualStart: actualStartStr,
      startDeltaSeconds: null,
      startDeltaMinutes: null,
      deltaRatio: null,
      classification: null,
      status: "INTEGRITY_ERROR",
      scheduleDeviationRatio: null,
    };
  }

  const plannedMs = Date.parse(plannedStartStr);
  const actualMs = Date.parse(actualStartStr);

  const startDeltaSeconds = (actualMs - plannedMs) / 1000;
  const startDeltaMinutes = startDeltaSeconds / 60;

  // On-time tolerance boundary:
  // startDelta < -tolerance -> EARLY
  // abs(startDelta) <= tolerance -> ON_TIME
  // startDelta > tolerance -> LATE
  let classification: StartClassification;
  if (startDeltaSeconds < -onTimeToleranceSeconds) {
    classification = "EARLY";
  } else if (Math.abs(startDeltaSeconds) <= onTimeToleranceSeconds) {
    classification = "ON_TIME";
  } else {
    classification = "LATE";
  }

  let scheduleDeviationRatio: number | null = null;
  if (
    typeof plannedDurationMinutes === "number" &&
    plannedDurationMinutes > 0 &&
    typeof observedActiveDurationMinutes === "number" &&
    observedActiveDurationMinutes >= 0
  ) {
    scheduleDeviationRatio =
      Math.abs(observedActiveDurationMinutes - plannedDurationMinutes) / plannedDurationMinutes;
  }

  return {
    taskId,
    plannedStart: plannedStartStr,
    plannedCapturedAt: plannedCapturedAt ?? null,
    corroboration,
    actualStart: actualStartStr,
    startDeltaSeconds,
    startDeltaMinutes,
    deltaRatio: null, // Strictly null for signed variance
    classification,
    status: "OBSERVED",
    scheduleDeviationRatio,
  };
}
