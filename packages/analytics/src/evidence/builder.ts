import type {
  EvidenceTimeline,
  TemporalEvidenceBlock,
  EvidenceCoverageState,
  EvidenceProvenance,
  EvidenceProvenanceRole,
  ObservationEvidence,
  ReportEvidence,
  IntentionEvidence,
  OutcomeEvidence,
  TimelineSegment,
  CheckIn,
  UserGapExplanation,
  WorkSession,
  Task,
  WorkContext,
  AttributionCorrection,
} from "@repo/types";
import { aggregateActivitySegments, TIMELINE_SEGMENTATION_OPTIONS } from "../activity/segments";
import type { BuildEvidenceOptions } from "./types";
import {
  toEpochMs,
  collectAtomicBoundaries,
  createAtomicIntervals,
  mergeAdjacentEquivalentBlocks,
  deduplicateProvenance,
} from "./slicing";

export const SOURCE_PRIORITY: Record<string, number> = {
  desktop: 1,
  browser: 2,
  unknown: 3,
};

export function telemetryProvenanceSource(
  source: TimelineSegment["source"],
): string {
  switch (source) {
    case "desktop":
      return "desktop_telemetry";
    case "browser":
      return "browser_telemetry";
    case "unknown":
      return "unknown_telemetry";
  }
}

export function compareSegmentsForPrimary(
  a: TimelineSegment,
  b: TimelineSegment,
  intervalStartMs: number,
  intervalEndMs: number,
): number {
  const aOverlap = Math.min(intervalEndMs, toEpochMs(a.end)) - Math.max(intervalStartMs, toEpochMs(a.start));
  const bOverlap = Math.min(intervalEndMs, toEpochMs(b.end)) - Math.max(intervalStartMs, toEpochMs(b.start));

  // 1. Largest overlap first
  if (bOverlap !== aOverlap) {
    return bOverlap - aOverlap;
  }

  // 2. Canonical source priority: desktop (1) > browser (2) > unknown (3)
  const aSrc = SOURCE_PRIORITY[a.source] ?? 99;
  const bSrc = SOURCE_PRIORITY[b.source] ?? 99;
  if (aSrc !== bSrc) {
    return aSrc - bSrc;
  }

  // 3. Earliest start timestamp
  const aStart = toEpochMs(a.start);
  const bStart = toEpochMs(b.start);
  if (aStart !== bStart) {
    return aStart - bStart;
  }

  // 4. Earliest end timestamp
  const aEnd = toEpochMs(a.end);
  const bEnd = toEpochMs(b.end);
  if (aEnd !== bEnd) {
    return aEnd - bEnd;
  }

  // 5. Lexicographical application name
  const appCmp = (a.application || "").localeCompare(b.application || "");
  if (appCmp !== 0) {
    return appCmp;
  }

  // 6. Lexicographical title
  const titleCmp = (a.title || "").localeCompare(b.title || "");
  if (titleCmp !== 0) {
    return titleCmp;
  }

  // 7. Deterministic unique tie-breaker: Segment ID
  return (a.id || "").localeCompare(b.id || "");
}

export interface NormalizedCheckInWindow {
  checkIn: CheckIn;
  startMs: number;
  endMs: number;
}

export interface NormalizedGapExplanation {
  explanation: UserGapExplanation;
  startMs: number;
  endMs: number;
}

export interface NormalizedSession {
  session: WorkSession;
  startMs: number;
  endMs: number;
}

export interface NormalizedWorkContext {
  context: WorkContext;
  startMs: number;
  endMs: number;
}

export interface NormalizedCorrection {
  correction: AttributionCorrection;
  startMs: number;
  endMs: number;
  createdAtMs: number;
}

export function compareCheckIns(a: NormalizedCheckInWindow, b: NormalizedCheckInWindow): number {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  if (a.endMs !== b.endMs) return a.endMs - b.endMs;
  return (a.checkIn.id || "").localeCompare(b.checkIn.id || "");
}

export function compareGapExplanations(
  a: NormalizedGapExplanation,
  b: NormalizedGapExplanation,
): number {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  if (a.endMs !== b.endMs) return a.endMs - b.endMs;
  return (a.explanation.id || "").localeCompare(b.explanation.id || "");
}

export function compareWorkSessions(a: NormalizedSession, b: NormalizedSession): number {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  if (a.endMs !== b.endMs) return a.endMs - b.endMs;
  return (a.session.id || "").localeCompare(b.session.id || "");
}

export function compareWorkContexts(a: NormalizedWorkContext, b: NormalizedWorkContext): number {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  if (a.endMs !== b.endMs) return a.endMs - b.endMs;
  return (a.context.id || "").localeCompare(b.context.id || "");
}

/**
 * Deterministic winner among overlapping work contexts: the latest-started
 * context wins; ties break by id (lexicographically greatest).
 */
export function compareWorkContextsLatestFirst(
  a: NormalizedWorkContext,
  b: NormalizedWorkContext,
): number {
  if (a.startMs !== b.startMs) return b.startMs - a.startMs;
  return (b.context.id || "").localeCompare(a.context.id || "");
}

export function compareCorrections(a: NormalizedCorrection, b: NormalizedCorrection): number {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  if (a.endMs !== b.endMs) return a.endMs - b.endMs;
  if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
  return (a.correction.id || "").localeCompare(b.correction.id || "");
}

/**
 * Deterministic winner among corrections overlapping one atomic interval (R1):
 * latest by `(createdAt, id)` wins; ties break by id (lexicographically greatest).
 */
export function compareCorrectionsLatestFirst(
  a: NormalizedCorrection,
  b: NormalizedCorrection,
): number {
  if (a.createdAtMs !== b.createdAtMs) return b.createdAtMs - a.createdAtMs;
  return (b.correction.id || "").localeCompare(a.correction.id || "");
}

export function compareTasksForOutcome(a: Task, b: Task): number {
  const aComp = a.completedAt ? toEpochMs(a.completedAt) : Infinity;
  const bComp = b.completedAt ? toEpochMs(b.completedAt) : Infinity;
  if (aComp !== bComp) return aComp - bComp;
  return (a.id || "").localeCompare(b.id || "");
}

export function buildEvidenceTimeline(options: BuildEvidenceOptions): EvidenceTimeline {
  const windowStartMs = toEpochMs(options.windowStart);
  const windowEndMs = toEpochMs(options.windowEnd);

  if (windowEndMs <= windowStartMs) {
    return {
      windowStart: new Date(windowStartMs).toISOString(),
      windowEnd: new Date(windowEndMs).toISOString(),
      totalDurationSeconds: 0,
      blocks: [],
      coverageSummary: {
        totalDurationSeconds: 0,
        observedSeconds: 0,
        reportedSeconds: 0,
        observedReportedSeconds: 0,
        unknownSeconds: 0,
        explainedGapSeconds: 0,
        coverageRatio: 0,
      },
    };
  }

  // 1. Resolve Telemetry Segments (deterministic sorting)
  // Canonical segmentation options (R4) so the events shortcut and the
  // production timeline path (which pre-aggregates with the same options)
  // always produce identical evidence.
  let segments: TimelineSegment[] = [];
  if (options.segments && options.segments.length > 0) {
    segments = [...options.segments];
  } else if (options.events && options.events.length > 0) {
    segments = aggregateActivitySegments(options.events, TIMELINE_SEGMENTATION_OPTIONS);
  }

  segments.sort((a, b) => {
    const aStart = toEpochMs(a.start);
    const bStart = toEpochMs(b.start);
    if (aStart !== bStart) return aStart - bStart;
    const aEnd = toEpochMs(a.end);
    const bEnd = toEpochMs(b.end);
    if (aEnd !== bEnd) return aEnd - bEnd;
    const aSrc = SOURCE_PRIORITY[a.source] ?? 99;
    const bSrc = SOURCE_PRIORITY[b.source] ?? 99;
    if (aSrc !== bSrc) return aSrc - bSrc;
    const appCmp = (a.application || "").localeCompare(b.application || "");
    if (appCmp !== 0) return appCmp;
    const titleCmp = (a.title || "").localeCompare(b.title || "");
    if (titleCmp !== 0) return titleCmp;
    return (a.id || "").localeCompare(b.id || "");
  });

  // 2. Normalize Check-in Windows (R6 temporal rule)
  // (1) windowStart valid and windowEnd valid with end > start -> [start, end]
  // (2) windowStart valid + windowEnd absent/unparseable + createdAt > start -> [start, createdAt]
  // (3) otherwise EXCLUDED. A point check-in (explicit end == start) is never
  //     expanded: it must not claim duration it cannot prove.
  const checkInWindows: NormalizedCheckInWindow[] = [];
  if (options.checkIns) {
    for (const ci of options.checkIns) {
      const hasEnd = ci.windowEnd !== null && ci.windowEnd !== undefined;
      const sMs = ci.windowStart ? Date.parse(ci.windowStart) : NaN;
      const eMs = hasEnd ? Date.parse(ci.windowEnd as string) : NaN;
      const cMs = ci.createdAt ? Date.parse(ci.createdAt) : NaN;

      let startMs = NaN;
      let endMs = NaN;

      if (!Number.isNaN(sMs)) {
        if (hasEnd && !Number.isNaN(eMs)) {
          if (eMs > sMs) {
            startMs = sMs;
            endMs = eMs;
          }
          // explicit end <= start (point/invalid window): excluded, never expanded
        } else if (!Number.isNaN(cMs) && cMs > sMs) {
          startMs = sMs;
          endMs = cMs;
        }
      }

      if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
        checkInWindows.push({ checkIn: ci, startMs, endMs });
      }
    }
  }

  checkInWindows.sort(compareCheckIns);

  // 3. Normalize Gap Explanations
  const gapExplanations: NormalizedGapExplanation[] = [];
  if (options.gapExplanations) {
    for (const exp of options.gapExplanations) {
      try {
        const sMs = toEpochMs(exp.startTime);
        const eMs = toEpochMs(exp.endTime);
        if (eMs > sMs) {
          gapExplanations.push({ explanation: exp, startMs: sMs, endMs: eMs });
        }
      } catch {
        // ignore invalid
      }
    }
  }

  gapExplanations.sort(compareGapExplanations);

  // 4. Normalize Work Sessions
  const sessions: NormalizedSession[] = [];
  if (options.sessions) {
    for (const s of options.sessions) {
      try {
        const sMs = toEpochMs(s.startedAt);
        const eMs = s.endedAt
          ? toEpochMs(s.endedAt)
          : sMs + (s.durationSeconds ?? 0) * 1000;
        if (eMs > sMs) {
          sessions.push({ session: s, startMs: sMs, endMs: eMs });
        }
      } catch {
        // ignore invalid
      }
    }
  }

  sessions.sort(compareWorkSessions);

  // 4b. Normalize Work Contexts (Phase 1 attribution signals)
  // Open contexts (endedAt === null) extend to the window end: the user is
  // still in that context as far as committed data knows.
  const workContexts: NormalizedWorkContext[] = [];
  if (options.workContexts) {
    for (const c of options.workContexts) {
      try {
        const sMs = toEpochMs(c.startedAt);
        const eMs = c.endedAt ? toEpochMs(c.endedAt) : Math.max(windowEndMs, sMs);
        if (eMs > sMs) {
          workContexts.push({ context: c, startMs: sMs, endMs: eMs });
        }
      } catch {
        // ignore invalid
      }
    }
  }

  workContexts.sort(compareWorkContexts);

  // 4c. Normalize Attribution Corrections (Phase 1, R1)
  // Append-only, latest-wins per atomic interval by (createdAt, id).
  const corrections: NormalizedCorrection[] = [];
  if (options.corrections) {
    for (const x of options.corrections) {
      try {
        const sMs = toEpochMs(x.windowStart);
        const eMs = toEpochMs(x.windowEnd);
        const cMs = toEpochMs(x.createdAt);
        if (eMs > sMs) {
          corrections.push({ correction: x, startMs: sMs, endMs: eMs, createdAtMs: cMs });
        }
      } catch {
        // ignore invalid
      }
    }
  }

  corrections.sort(compareCorrections);

  // 5. Tasks Lookup Map & Deterministically Sorted Tasks
  const taskMap = new Map<string, Task>();
  const tasks: Task[] = options.tasks ? [...options.tasks].sort(compareTasksForOutcome) : [];
  for (const t of tasks) {
    taskMap.set(t.id, t);
  }

  // 6. Slicing: Collect all boundaries and create atomic intervals
  const boundaries = collectAtomicBoundaries(options, windowStartMs, windowEndMs);
  const atomicIntervals = createAtomicIntervals(boundaries);

  // 7. Evaluate each atomic interval
  const atomicBlocks: TemporalEvidenceBlock[] = [];

  for (let i = 0; i < atomicIntervals.length; i++) {
    const { startMs, endMs, durationSeconds } = atomicIntervals[i]!;
    const provenance: EvidenceProvenance[] = [];

    // A. Check Observation Telemetry
    let observation: ObservationEvidence | null = null;
    let isObserved = false;

    // Find overlapping segments
    const overlappingSegments = segments.filter(
      (seg) => toEpochMs(seg.start) < endMs && toEpochMs(seg.end) > startMs,
    );

    if (overlappingSegments.length > 0) {
      // Pick primary segment using deterministic total ordering
      overlappingSegments.sort((a, b) => compareSegmentsForPrimary(a, b, startMs, endMs));

      const primarySeg = overlappingSegments[0]!;
      isObserved = true;
      // Note: AFK requires an explicit OS AFK watcher signal, not merely category === "break" (which also includes screen lock)
      const isAfk = Boolean(
        primarySeg.isAfk ??
        (primarySeg.application === "Away from Keyboard" || (primarySeg as any).watcher === "afk")
      );

      observation = {
        application: primarySeg.application,
        title: primarySeg.title,
        cleanTitle: primarySeg.primaryTitle || primarySeg.displayTitle || primarySeg.title,
        domain: primarySeg.domain ?? null,
        sanitizedUrl: null,
        category: primarySeg.category,
        isAfk,
        rawEventCount: primarySeg.rawEventCount ?? 1,
      };

      // Option B: Multi-source telemetry preservation
      // Preserve provenance for ALL overlapping telemetry sources while retaining dominant primary observation
      for (const seg of overlappingSegments) {
        provenance.push({
          source: telemetryProvenanceSource(seg.source),
          authority: "SYSTEM",
        });
      }
    }

    // B. Check Gap Explanation
    let isGapExplained = false;
    let matchingGapExp: UserGapExplanation | null = null;

    for (const g of gapExplanations) {
      if (g.startMs < endMs && g.endMs > startMs) {
        isGapExplained = true;
        matchingGapExp = g.explanation;
        break;
      }
    }
    // Note: gap-explanation provenance is attached in section F with a role
    // relative to the resolved intention (R7).

    // C. Check User Check-In Report
    let isReported = false;
    let matchingCheckIn: CheckIn | null = null;
    let matchingCheckInWindow: NormalizedCheckInWindow | null = null;

    for (const cw of checkInWindows) {
      if (cw.startMs < endMs && cw.endMs > startMs) {
        isReported = true;
        matchingCheckIn = cw.checkIn;
        matchingCheckInWindow = cw;
        break;
      }
    }
    // Note: check-in provenance is attached in section F with a role relative
    // to the resolved intention (R7).

    // D. Assemble Report Evidence
    let report: ReportEvidence | null = null;
    if (isGapExplained && matchingGapExp) {
      report = {
        source: "GAP_EXPLANATION",
        reportingWindow: {
          start: new Date(toEpochMs(matchingGapExp.startTime)).toISOString(),
          end: new Date(toEpochMs(matchingGapExp.endTime)).toISOString(),
        },
        gapReason: matchingGapExp.description,
        offlineWorkContext: matchingGapExp.offlineWorkContext ?? null,
        authority: "USER",
      };
    } else if (isReported && matchingCheckIn && matchingCheckInWindow) {
      report = {
        source: "CHECK_IN",
        reportingWindow: {
          start: new Date(matchingCheckInWindow.startMs).toISOString(),
          end: new Date(matchingCheckInWindow.endMs).toISOString(),
        },
        assessment: matchingCheckIn.activityAssessment ?? null,
        alignment: matchingCheckIn.alignment ?? null,
        energy: matchingCheckIn.energy ?? null,
        focus: matchingCheckIn.focus ?? null,
        note: matchingCheckIn.note ?? null,
        reasons: matchingCheckIn.reasons ?? [],
        authority: "USER",
      };
    }

    // E. Coverage State Decision via Precedence Tree:
    // Telemetry covers interval?
    //   YES -> User report covers it? -> YES: OBSERVED_REPORTED, NO: OBSERVED
    //   NO  -> User report covers it?
    //            YES -> Specifically explaining missing telemetry? -> YES: EXPLAINED_GAP, NO: REPORTED
    //            NO  -> UNKNOWN
    let coverage: EvidenceCoverageState;
    if (isObserved) {
      if (isReported || isGapExplained) {
        coverage = "OBSERVED_REPORTED";
      } else {
        coverage = "OBSERVED";
      }
    } else {
      if (isGapExplained) {
        coverage = "EXPLAINED_GAP";
      } else if (isReported) {
        coverage = "REPORTED";
      } else {
        coverage = "UNKNOWN";
      }
    }

    // F. Intention Link — precedence (R7):
    //   correction (latest per atomic interval) > work context > session task
    //   > gap-explanation association > check-in task.
    // Every overlapping attribution signal is preserved in provenance with a
    // role (SELECTED / SUPPORTING / CONFLICTING) and its target task, so
    // losing attributions stay auditable instead of being silently dropped.
    let intention: IntentionEvidence | null = null;
    let intentionSource:
      | "correction"
      | "work_context"
      | "work_session"
      | "gap_explanation"
      | "check_in"
      | null = null;

    const overlappingCorrections = corrections.filter(
      (x) => x.startMs < endMs && x.endMs > startMs,
    );
    const correctionWinner =
      overlappingCorrections.length > 0
        ? [...overlappingCorrections].sort(compareCorrectionsLatestFirst)[0]!
        : null;

    const overlappingContexts = workContexts.filter(
      (c) => c.startMs < endMs && c.endMs > startMs && (c.context.taskId || c.context.goalId),
    );
    const contextWinner =
      overlappingContexts.length > 0
        ? [...overlappingContexts].sort(compareWorkContextsLatestFirst)[0]!
        : null;

    const activeSession = sessions.find(
      (s) => s.startMs < endMs && s.endMs > startMs && s.session.taskId,
    );

    if (correctionWinner) {
      const x = correctionWinner.correction;
      if (x.targetKind === "NONE") {
        intention = {
          targetScope: "UNLINKED",
          taskId: null,
          taskTitle: null,
          goalId: null,
          goalTitle: null,
          linkType: "EXPLICIT",
        };
      } else {
        const taskId = x.taskId;
        const matchingTask = taskId ? taskMap.get(taskId) : undefined;
        intention = {
          targetScope: taskId ? "TASK" : "UNLINKED",
          taskId,
          taskTitle: matchingTask?.title ?? x.taskTitleSnapshot ?? null,
          goalId: matchingTask?.goalId ?? null,
          goalTitle: matchingTask?.goalTitle ?? null,
          linkType: "EXPLICIT",
        };
      }
      intentionSource = "correction";
    } else if (contextWinner) {
      const taskId = contextWinner.context.taskId;
      const goalId = contextWinner.context.goalId;
      const matchingTask = taskId ? taskMap.get(taskId) : undefined;
      intention = {
        targetScope: taskId ? "TASK" : "GOAL",
        taskId,
        taskTitle: matchingTask?.title ?? null,
        goalId,
        goalTitle: matchingTask?.goalTitle ?? null,
        linkType: "EXPLICIT",
      };
      intentionSource = "work_context";
    } else if (activeSession && activeSession.session.taskId) {
      const taskId = activeSession.session.taskId;
      const matchingTask = taskMap.get(taskId);
      intention = {
        targetScope: "TASK",
        taskId,
        taskTitle: matchingTask?.title ?? activeSession.session.taskTitle ?? null,
        goalId: matchingTask?.goalId ?? null,
        goalTitle: matchingTask?.goalTitle ?? activeSession.session.goalTitle ?? null,
        linkType: "EXPLICIT",
      };
      intentionSource = "work_session";
    } else if (matchingGapExp && (matchingGapExp.associatedTaskId || matchingGapExp.associatedGoalId)) {
      const taskId = matchingGapExp.associatedTaskId ?? null;
      const goalId = matchingGapExp.associatedGoalId ?? null;
      const matchingTask = taskId ? taskMap.get(taskId) : undefined;
      intention = {
        targetScope: taskId ? "TASK" : "GOAL",
        taskId,
        taskTitle: matchingTask?.title ?? null,
        goalId,
        linkType: "EXPLICIT",
      };
      intentionSource = "gap_explanation";
    } else if (matchingCheckIn && matchingCheckIn.taskId) {
      const taskId = matchingCheckIn.taskId;
      const matchingTask = taskMap.get(taskId);
      intention = {
        targetScope: "TASK",
        taskId,
        taskTitle: matchingTask?.title ?? null,
        goalId: matchingTask?.goalId ?? null,
        linkType: "EXPLICIT",
      };
      intentionSource = "check_in";
    }

    // F2. Role-aware attribution provenance (R7). Entries only receive
    // role/target fields when the signal carries attribution information;
    // plain telemetry provenance stays untouched.
    const intentionTaskId = intention?.taskId ?? null;

    const roleFor = (
      targetTaskId: string | null | undefined,
      isSelected: boolean,
    ): EvidenceProvenanceRole | undefined => {
      if (isSelected) return "SELECTED";
      if (targetTaskId === null || targetTaskId === undefined) return undefined;
      if (intentionTaskId !== null && targetTaskId === intentionTaskId) return "SUPPORTING";
      return "CONFLICTING";
    };

    if (correctionWinner) {
      const x = correctionWinner.correction;
      const taskId = x.targetKind === "NONE" ? null : x.taskId;
      const matchingTask = taskId ? taskMap.get(taskId) : undefined;
      provenance.push({
        source: "user_correction",
        authority: "USER",
        role: "SELECTED",
        targetTaskId: taskId,
        targetTaskTitle:
          x.targetKind === "NONE" ? null : matchingTask?.title ?? x.taskTitleSnapshot ?? null,
      });
    }

    if (contextWinner) {
      const taskId = contextWinner.context.taskId;
      const matchingTask = taskId ? taskMap.get(taskId) : undefined;
      const entry: EvidenceProvenance = {
        source: "work_context",
        authority: "SYSTEM",
      };
      const role = roleFor(taskId, intentionSource === "work_context");
      if (role) entry.role = role;
      if (taskId !== null) {
        entry.targetTaskId = taskId;
        entry.targetTaskTitle = matchingTask?.title ?? null;
      }
      provenance.push(entry);
    }

    if (activeSession && activeSession.session.taskId) {
      const taskId = activeSession.session.taskId;
      const matchingTask = taskMap.get(taskId);
      const entry: EvidenceProvenance = {
        source: "work_session",
        authority: "SYSTEM",
      };
      const role = roleFor(taskId, intentionSource === "work_session");
      if (role) entry.role = role;
      if (taskId) {
        entry.targetTaskId = taskId;
        entry.targetTaskTitle = matchingTask?.title ?? activeSession.session.taskTitle ?? null;
      }
      provenance.push(entry);
    }

    if (matchingGapExp) {
      const entry: EvidenceProvenance = {
        source: "user_gap_explanation",
        authority: "USER",
      };
      const modelTaskId = matchingGapExp.associatedTaskId ?? null;
      const role = roleFor(modelTaskId, intentionSource === "gap_explanation");
      if (role) entry.role = role;
      if (modelTaskId !== null) {
        entry.targetTaskId = modelTaskId;
        entry.targetTaskTitle = taskMap.get(modelTaskId)?.title ?? null;
      }
      provenance.push(entry);
    }

    if (matchingCheckIn) {
      const entry: EvidenceProvenance = {
        source: "user_check_in",
        authority: "USER",
      };
      const modelTaskId = matchingCheckIn.taskId ?? null;
      const role = roleFor(modelTaskId, intentionSource === "check_in");
      if (role) entry.role = role;
      if (modelTaskId !== null) {
        entry.targetTaskId = modelTaskId;
        entry.targetTaskTitle = taskMap.get(modelTaskId)?.title ?? null;
      }
      provenance.push(entry);
    }

    // G. Outcome Evidence (Separate signal)
    let outcome: OutcomeEvidence | null = null;
    if (tasks.length > 0) {
      const completedTask = tasks.find((t) => {
        if (!t.completedAt) return false;
        try {
          const compMs = toEpochMs(t.completedAt);
          return compMs >= startMs && compMs < endMs;
        } catch {
          return false;
        }
      });

      if (completedTask) {
        outcome = {
          taskId: completedTask.id,
          taskStatus: completedTask.status,
          taskCompletedAt: completedTask.completedAt,
          goalId: completedTask.goalId ?? null,
        };
      }
    }

    atomicBlocks.push({
      id: `atomic-${i + 1}`,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      durationSeconds,
      coverage,
      provenance: deduplicateProvenance(provenance),
      observation,
      report,
      intention,
      outcome,
    });
  }

  // 8. Merge adjacent semantically equivalent blocks
  const mergedBlocks = mergeAdjacentEquivalentBlocks(atomicBlocks);

  // Assign deterministic sequential IDs
  for (let i = 0; i < mergedBlocks.length; i++) {
    mergedBlocks[i]!.id = `block-${i + 1}`;
  }

  // 9. Compute Coverage Summary Metrics
  const totalDurationSeconds = Math.round((windowEndMs - windowStartMs) / 1000);
  let observedSeconds = 0;
  let reportedSeconds = 0;
  let observedReportedSeconds = 0;
  let unknownSeconds = 0;
  let explainedGapSeconds = 0;

  for (const b of mergedBlocks) {
    switch (b.coverage) {
      case "OBSERVED":
        observedSeconds += b.durationSeconds;
        break;
      case "REPORTED":
        reportedSeconds += b.durationSeconds;
        break;
      case "OBSERVED_REPORTED":
        observedReportedSeconds += b.durationSeconds;
        break;
      case "UNKNOWN":
        unknownSeconds += b.durationSeconds;
        break;
      case "EXPLAINED_GAP":
        explainedGapSeconds += b.durationSeconds;
        break;
    }
  }

  const accountedSeconds = totalDurationSeconds - unknownSeconds;
  const coverageRatio =
    totalDurationSeconds > 0
      ? Number(Math.max(0, Math.min(1, accountedSeconds / totalDurationSeconds)).toFixed(4))
      : 0;

  return {
    windowStart: new Date(windowStartMs).toISOString(),
    windowEnd: new Date(windowEndMs).toISOString(),
    totalDurationSeconds,
    blocks: mergedBlocks,
    coverageSummary: {
      totalDurationSeconds,
      observedSeconds,
      reportedSeconds,
      observedReportedSeconds,
      unknownSeconds,
      explainedGapSeconds,
      coverageRatio,
    },
  };
}
