import type {
  EvidenceTimeline,
  TemporalEvidenceBlock,
  EvidenceCoverageState,
  EvidenceProvenance,
  ObservationEvidence,
  ReportEvidence,
  IntentionEvidence,
  OutcomeEvidence,
  TimelineSegment,
  CheckIn,
  UserGapExplanation,
  WorkSession,
  Task,
} from "@repo/types";
import { aggregateActivitySegments } from "../activity/segments";
import type { BuildEvidenceOptions } from "./types";
import {
  toEpochMs,
  collectAtomicBoundaries,
  createAtomicIntervals,
  mergeAdjacentEquivalentBlocks,
} from "./slicing";

interface NormalizedCheckInWindow {
  checkIn: CheckIn;
  startMs: number;
  endMs: number;
}

interface NormalizedGapExplanation {
  explanation: UserGapExplanation;
  startMs: number;
  endMs: number;
}

interface NormalizedSession {
  session: WorkSession;
  startMs: number;
  endMs: number;
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
  let segments: TimelineSegment[] = [];
  if (options.segments && options.segments.length > 0) {
    segments = [...options.segments];
  } else if (options.events && options.events.length > 0) {
    segments = aggregateActivitySegments(options.events);
  }

  segments.sort((a, b) => {
    const aStart = toEpochMs(a.start);
    const bStart = toEpochMs(b.start);
    if (aStart !== bStart) return aStart - bStart;
    return toEpochMs(a.end) - toEpochMs(b.end);
  });

  // 2. Normalize Check-in Windows
  const checkInWindows: NormalizedCheckInWindow[] = [];
  if (options.checkIns) {
    for (const ci of options.checkIns) {
      const sMs = ci.windowStart ? Date.parse(ci.windowStart) : NaN;
      const eMs = ci.windowEnd ? Date.parse(ci.windowEnd) : NaN;
      const cMs = ci.createdAt ? Date.parse(ci.createdAt) : NaN;

      let startMs = NaN;
      let endMs = NaN;

      if (!Number.isNaN(sMs) && !Number.isNaN(eMs) && eMs > sMs) {
        startMs = sMs;
        endMs = eMs;
      } else if (!Number.isNaN(sMs) && !Number.isNaN(cMs) && cMs > sMs) {
        startMs = sMs;
        endMs = cMs;
      } else if (!Number.isNaN(cMs)) {
        // Fallback: point reflection
        startMs = cMs;
        endMs = cMs;
      }

      if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
        checkInWindows.push({ checkIn: ci, startMs, endMs });
      }
    }
  }

  checkInWindows.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

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

  gapExplanations.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

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

  sessions.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  // 5. Tasks Lookup Map
  const taskMap = new Map<string, Task>();
  if (options.tasks) {
    for (const t of options.tasks) {
      taskMap.set(t.id, t);
    }
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
      // Pick primary segment (longest overlap with this atomic interval)
      overlappingSegments.sort((a, b) => {
        const aOverlap = Math.min(endMs, toEpochMs(a.end)) - Math.max(startMs, toEpochMs(a.start));
        const bOverlap = Math.min(endMs, toEpochMs(b.end)) - Math.max(startMs, toEpochMs(b.start));
        return bOverlap - aOverlap;
      });

      const primarySeg = overlappingSegments[0]!;
      isObserved = true;
      const isAfk = primarySeg.type === "break" || primarySeg.category === "break";

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

      provenance.push({
        source: primarySeg.source === "browser" ? "browser_telemetry" : "desktop_telemetry",
        authority: "SYSTEM",
      });
    }

    // B. Check Gap Explanation
    let isGapExplained = false;
    let matchingGapExp: UserGapExplanation | null = null;

    for (const g of gapExplanations) {
      if (g.startMs < endMs && g.endMs > startMs) {
        isGapExplained = true;
        matchingGapExp = g.explanation;
        provenance.push({
          source: "user_gap_explanation",
          authority: "USER",
        });
        break;
      }
    }

    // C. Check User Check-In Report
    let isReported = false;
    let matchingCheckIn: CheckIn | null = null;

    for (const cw of checkInWindows) {
      if (cw.startMs < endMs && cw.endMs > startMs) {
        isReported = true;
        matchingCheckIn = cw.checkIn;
        provenance.push({
          source: "user_check_in",
          authority: "USER",
        });
        break;
      }
    }

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
    } else if (isReported && matchingCheckIn) {
      report = {
        source: "CHECK_IN",
        reportingWindow: {
          start: matchingCheckIn.windowStart
            ? new Date(toEpochMs(matchingCheckIn.windowStart)).toISOString()
            : new Date(startMs).toISOString(),
          end: matchingCheckIn.windowEnd
            ? new Date(toEpochMs(matchingCheckIn.windowEnd)).toISOString()
            : new Date(endMs).toISOString(),
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

    // F. Intention Link (Explicit vs Inferred vs Unknown)
    let intention: IntentionEvidence | null = null;

    // Check active session with explicit taskId
    const activeSession = sessions.find(
      (s) => s.startMs < endMs && s.endMs > startMs && s.session.taskId,
    );

    if (activeSession && activeSession.session.taskId) {
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
      provenance.push({
        source: "work_session",
        authority: "SYSTEM",
      });
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
    }

    // G. Outcome Evidence (Separate signal)
    let outcome: OutcomeEvidence | null = null;
    if (options.tasks) {
      const completedTask = options.tasks.find((t) => {
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
      provenance,
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
