import type {
  StartClassification,
  StartDeltaStatus,
  ScheduleVarianceEpisodeMetrics,
} from "./types";

export interface ResolvedActualStart {
  actualStart: string;
  sessionId: string;
}

export interface SessionEvidenceItem {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
}

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
 * Invariant: Primary: startedAt ascending. Secondary: stable session id ascending.
 * Replayed or duplicate session IDs are collapsed to unique sessions.
 */
export function sortAndDeduplicateSessions(
  sessions: SessionEvidenceItem[]
): SessionEvidenceItem[] {
  // Deduplicate by ID
  const uniqueMap = new Map<string, SessionEvidenceItem>();
  for (const session of sessions) {
    if (!session.id) continue;
    if (!uniqueMap.has(session.id)) {
      uniqueMap.set(session.id, session);
    }
  }

  const uniqueList = Array.from(uniqueMap.values());

  return uniqueList.sort((a, b) => {
    const aStart = Date.parse(a.startedAt);
    const bStart = Date.parse(b.startedAt);
    if (aStart !== bStart) {
      return aStart - bStart;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Resolves the first qualifying actual execution start for a task instance.
 * Validates session start time and returns the earliest valid execution.
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
        // Invalid session where end precedes start -> skip
        continue;
      }
    }

    return {
      actualStart: session.startedAt,
      sessionId: session.id,
    };
  }

  return null;
}

/**
 * Calculates signed schedule variance: actualStart - plannedStart.
 * 
 * Strict Invariants:
 * - negative -> started early
 * - 0 -> exact on-time
 * - positive -> started late
 * - deltaRatio is strictly null (never compute relative ratio on signed deviation)
 * - Zero manufacturing of evidence or timestamps
 */
export function calculateScheduleVariance(
  taskId: string,
  plannedStartStr: string | null,
  actualStartStr: string | null,
  onTimeToleranceSeconds: number,
  plannedDurationMinutes?: number | null,
  observedActiveDurationMinutes?: number | null
): ScheduleVarianceEpisodeMetrics {
  // 1. Missing plannedStart
  if (!plannedStartStr) {
    return {
      taskId,
      plannedStart: null,
      actualStart: actualStartStr,
      startDeltaSeconds: null,
      startDeltaMinutes: null,
      deltaRatio: null,
      classification: null,
      status: "NO_PLANNED_START",
      scheduleDeviationRatio: null,
    };
  }

  // 2. Validate plannedStart timestamp
  if (!isValidTimestamp(plannedStartStr)) {
    return {
      taskId,
      plannedStart: plannedStartStr,
      actualStart: actualStartStr,
      startDeltaSeconds: null,
      startDeltaMinutes: null,
      deltaRatio: null,
      classification: null,
      status: "INDETERMINATE_COVERAGE",
      scheduleDeviationRatio: null,
    };
  }

  // 3. Missing actualStart (no execution observed)
  if (!actualStartStr) {
    return {
      taskId,
      plannedStart: plannedStartStr,
      actualStart: null,
      startDeltaSeconds: null,
      startDeltaMinutes: null,
      deltaRatio: null,
      classification: null,
      status: "NOT_OBSERVED",
      scheduleDeviationRatio: null,
    };
  }

  // 4. Validate actualStart timestamp
  if (!isValidTimestamp(actualStartStr)) {
    return {
      taskId,
      plannedStart: plannedStartStr,
      actualStart: actualStartStr,
      startDeltaSeconds: null,
      startDeltaMinutes: null,
      deltaRatio: null,
      classification: null,
      status: "INDETERMINATE_COVERAGE",
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
    actualStart: actualStartStr,
    startDeltaSeconds,
    startDeltaMinutes,
    deltaRatio: null, // Strictly null for signed variance
    classification,
    status: "OBSERVED",
    scheduleDeviationRatio,
  };
}
