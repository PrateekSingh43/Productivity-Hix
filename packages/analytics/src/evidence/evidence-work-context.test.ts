import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregateActivitySegments, TIMELINE_SEGMENTATION_OPTIONS } from "../activity/segments";
import { buildEvidenceTimeline } from "./builder";
import type {
  CheckIn,
  EvidenceTimeline,
  Task,
  TimelineSegment,
  UserGapExplanation,
  WorkSession,
} from "@repo/types";
import type { AttributionCorrection, WorkContext } from "@repo/types";

/**
 * Phase 1 contract tests: WorkContext + attribution corrections + role-aware
 * provenance + canonical segmentation + check-in temporal bounds.
 *
 * These tests pin the R1–R7 decisions from
 * docs/superpowers/plans/2026-10-18-work-context-task-attribution-revision.md (Revision 2).
 */

const WINDOW = { start: "2026-09-14T10:00:00.000Z", end: "2026-09-14T11:00:00.000Z" };
const ISO = "2026-09-14T09:00:00.000Z";

function segment(id: string, start: string, end: string): TimelineSegment {
  return {
    id,
    start,
    end,
    durationMs: Date.parse(end) - Date.parse(start),
    durationSeconds: Math.round((Date.parse(end) - Date.parse(start)) / 1000),
    source: "desktop",
    type: "application",
    application: "Visual Studio Code",
    title: "service.ts",
    category: "focused",
  };
}

function task(id: string, title: string): Task {
  return {
    id,
    userId: "u1",
    title,
    description: null,
    status: "todo",
    priority: "medium",
    plannedDurationMinutes: 30,
    dueAt: null,
    completedAt: null,
    createdAt: ISO,
    updatedAt: ISO,
  };
}

function session(id: string, taskId: string | null, start: string, end: string): WorkSession {
  return {
    id,
    taskId,
    startedAt: start,
    endedAt: end,
    durationSeconds: Math.round((Date.parse(end) - Date.parse(start)) / 1000),
    source: "manual",
  };
}

function context(
  id: string,
  taskId: string | null,
  start: string,
  end: string | null = null,
): WorkContext {
  return {
    id,
    userId: "u1",
    taskId,
    goalId: null,
    startedAt: start,
    endedAt: end,
    startedBySessionId: null,
    endedReason: null,
  };
}

function correction(
  id: string,
  windowStart: string,
  windowEnd: string,
  targetKind: "TASK" | "NONE",
  taskId: string | null,
  taskTitleSnapshot: string | null,
  createdAt: string,
): AttributionCorrection {
  return {
    id,
    userId: "u1",
    windowStart,
    windowEnd,
    targetKind,
    taskId,
    taskTitleSnapshot,
    reason: null,
    supersedesCorrectionId: null,
    createdAt,
  };
}

function checkIn(overrides: Partial<CheckIn>): CheckIn {
  return {
    id: "ci-1",
    userId: "u1",
    workSessionId: null,
    taskId: null,
    windowStart: null,
    windowEnd: null,
    activityAssessment: "productive",
    alignment: "yes",
    reasons: [],
    state: "neutral",
    energy: "medium",
    focus: "focused",
    note: null,
    questionVersion: "v1",
    source: "extension_hourly",
    intent: null,
    progress: null,
    blocker: null,
    productive: null,
    outcome: null,
    createdAt: "2026-09-14T10:30:00.000Z",
    ...overrides,
  };
}

function intentionAt(timeline: EvidenceTimeline, isoInstant: string) {
  const t = Date.parse(isoInstant);
  const block = timeline.blocks.find(
    (b) => Date.parse(b.startTime) <= t && t < Date.parse(b.endTime),
  );
  return block ? block.intention : null;
}

function provenanceOf(
  timeline: EvidenceTimeline,
  isoInstant: string,
  source: string,
) {
  const t = Date.parse(isoInstant);
  const block = timeline.blocks.find(
    (b) => Date.parse(b.startTime) <= t && t < Date.parse(b.endTime),
  );
  return block?.provenance.filter((p) => p.source === source) ?? [];
}

const T1 = "2026-09-14T10:00:00.000Z";
const T1030 = "2026-09-14T10:30:00.000Z";
const T1045 = "2026-09-14T10:45:00.000Z";
const T1015 = "2026-09-14T10:15:00.000Z";
const T1020 = "2026-09-14T10:20:00.000Z";
const T1035 = "2026-09-14T10:35:00.000Z";

const TASKS = [task("t1", "Task Alpha"), task("t2", "Task Beta"), task("t3", "Task Gamma")];

describe("Phase 1: WorkContext + correction attribution contract", () => {
  it("R7: correction overrides context and session; all losing sources remain visible as CONFLICTING", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      segments: [segment("seg-1", T1, "2026-09-14T10:45:00.000Z")],
      tasks: TASKS,
      sessions: [session("s1", "t1", T1, "2026-09-14T10:40:00.000Z")],
      workContexts: [context("c1", "t2", T1)],
      corrections: [
        correction("x1", T1, T1030, "TASK", "t3", "Task Gamma", "2026-09-14T10:31:00.000Z"),
      ],
    });

    const intention = intentionAt(timeline, T1015);
    assert.ok(intention);
    assert.equal(intention.taskId, "t3");
    assert.equal(intention.taskTitle, "Task Gamma");
    assert.equal(intention.linkType, "EXPLICIT");
    assert.equal(intention.targetScope, "TASK");

    const correctionProv = provenanceOf(timeline, T1015, "user_correction");
    assert.equal(correctionProv.length, 1);
    assert.equal(correctionProv[0]!.role, "SELECTED");
    assert.equal(correctionProv[0]!.targetTaskId, "t3");
    assert.equal(correctionProv[0]!.authority, "USER");

    const contextProv = provenanceOf(timeline, T1015, "work_context");
    assert.equal(contextProv.length, 1);
    assert.equal(contextProv[0]!.role, "CONFLICTING");
    assert.equal(contextProv[0]!.targetTaskId, "t2");

    const sessionProv = provenanceOf(timeline, T1015, "work_session");
    assert.equal(sessionProv.length, 1);
    assert.equal(sessionProv[0]!.role, "CONFLICTING");
    assert.equal(sessionProv[0]!.targetTaskId, "t1");
  });

  it("R7: WorkContext wins over session link; session's original task stays visible as CONFLICTING", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      segments: [segment("seg-1", T1, "2026-09-14T10:45:00.000Z")],
      tasks: TASKS,
      sessions: [session("s1", "t1", T1, "2026-09-14T10:40:00.000Z")],
      workContexts: [context("c1", "t2", T1)],
    });

    const intention = intentionAt(timeline, T1015);
    assert.ok(intention);
    assert.equal(intention.taskId, "t2");
    assert.equal(intention.linkType, "EXPLICIT");

    const contextProv = provenanceOf(timeline, T1015, "work_context");
    assert.equal(contextProv[0]!.role, "SELECTED");
    assert.equal(contextProv[0]!.targetTaskId, "t2");

    const sessionProv = provenanceOf(timeline, T1015, "work_session");
    assert.equal(sessionProv[0]!.role, "CONFLICTING");
    assert.equal(sessionProv[0]!.targetTaskId, "t1");
    assert.equal(sessionProv[0]!.targetTaskTitle, "Task Alpha");
  });

  it("R2: corrected-to-none projects as EXPLICIT UNLINKED and is never silently UNKNOWN", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      segments: [segment("seg-1", T1, "2026-09-14T10:45:00.000Z")],
      tasks: TASKS,
      sessions: [session("s1", "t1", T1, "2026-09-14T10:40:00.000Z")],
      workContexts: [context("c1", "t2", T1)],
      corrections: [correction("x1", T1, T1030, "NONE", null, null, "2026-09-14T10:31:00.000Z")],
    });

    const intention = intentionAt(timeline, T1015);
    assert.ok(intention, "corrected-to-none must produce an explicit intention, not null");
    assert.equal(intention.targetScope, "UNLINKED");
    assert.equal(intention.linkType, "EXPLICIT");
    assert.equal(intention.taskId, null);

    const correctionProv = provenanceOf(timeline, T1015, "user_correction");
    assert.equal(correctionProv[0]!.role, "SELECTED");
    assert.equal(correctionProv[0]!.targetTaskId, null);

    const contextProv = provenanceOf(timeline, T1015, "work_context");
    assert.equal(contextProv[0]!.role, "CONFLICTING");
    assert.equal(contextProv[0]!.targetTaskId, "t2");

    // Outside the correction window, the context resumes winning.
    const laterIntention = intentionAt(timeline, T1035);
    assert.equal(laterIntention?.taskId, "t2");
  });

  it("R1: overlapping corrections resolve per atomic interval by (createdAt, id)", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      segments: [segment("seg-1", T1, "2026-09-14T11:00:00.000Z")],
      tasks: TASKS,
      corrections: [
        correction("corr-a", T1, T1030, "TASK", "t1", "Task Alpha", "2026-09-14T10:05:00.000Z"),
        correction("corr-b", T1015, T1045, "TASK", "t2", "Task Beta", "2026-09-14T10:20:00.000Z"),
      ],
    });

    // [10:00,10:15) only corr-a overlaps -> t1
    assert.equal(intentionAt(timeline, "2026-09-14T10:05:00.000Z")?.taskId, "t1");
    // [10:15,10:30) both overlap; corr-b newer -> t2
    assert.equal(intentionAt(timeline, T1020)?.taskId, "t2");
    // [10:30,10:45) only corr-b -> t2
    assert.equal(intentionAt(timeline, T1035)?.taskId, "t2");
    // [10:45,11:00) no correction -> no intention
    assert.equal(intentionAt(timeline, "2026-09-14T10:50:00.000Z"), null);
  });

  it("R1: latest-wins tie-break by id is deterministic and permutation invariant", () => {
    const a = correction("corr-a", T1, T1030, "TASK", "t1", "Task Alpha", "2026-09-14T10:10:00.000Z");
    const b = correction("corr-b", T1, T1030, "TASK", "t2", "Task Beta", "2026-09-14T10:10:00.000Z");

    const base = {
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      segments: [segment("seg-1", T1, T1030)],
      tasks: TASKS,
    };

    const forward = buildEvidenceTimeline({ ...base, corrections: [a, b] });
    const reversed = buildEvidenceTimeline({ ...base, corrections: [b, a] });

    assert.equal(intentionAt(forward, T1015)?.taskId, "t2");
    assert.deepEqual(forward.blocks, reversed.blocks);
  });

  it("R6: point check-ins (start == end) create no duration coverage and no intention", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      tasks: TASKS,
      checkIns: [
        checkIn({
          id: "ci-point",
          taskId: "t1",
          windowStart: T1030,
          windowEnd: T1030,
          createdAt: "2026-09-14T10:31:00.000Z",
        }),
      ],
    });

    assert.equal(timeline.coverageSummary.reportedSeconds, 0);
    assert.equal(timeline.coverageSummary.observedReportedSeconds, 0);
    for (const b of timeline.blocks) {
      assert.equal(b.report, null);
      assert.equal(b.intention, null);
    }
  });

  it("R6: check-ins without any usable window are excluded entirely", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      tasks: TASKS,
      checkIns: [
        checkIn({
          id: "ci-nowindow",
          taskId: "t1",
          windowStart: null,
          windowEnd: null,
          createdAt: "2026-09-14T10:30:00.000Z",
        }),
      ],
    });

    assert.equal(timeline.coverageSummary.reportedSeconds, 0);
    for (const b of timeline.blocks) {
      assert.equal(b.report, null);
      assert.equal(b.intention, null);
    }
  });

  it("R6: windowStart-only check-in remains bounded to [windowStart, createdAt]", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      tasks: TASKS,
      checkIns: [
        checkIn({
          id: "ci-partial",
          taskId: "t1",
          windowStart: T1,
          windowEnd: null,
          createdAt: T1030,
        }),
      ],
    });

    assert.equal(timeline.coverageSummary.reportedSeconds, 1800);
    assert.equal(intentionAt(timeline, T1015)?.taskId, "t1");
    assert.equal(intentionAt(timeline, T1035), null);
  });

  it("R6: correction NONE overrides gap-explanation association and marks it CONFLICTING", () => {
    const gapExplanations: UserGapExplanation[] = [
      {
        id: "gap-1",
        gapId: "g-1",
        userId: "u1",
        startTime: T1,
        endTime: T1030,
        explanationType: "OFFLINE_WORK",
        description: "offline",
        offlineWorkContext: null,
        associatedTaskId: "t1",
        associatedGoalId: null,
        createdAt: ISO,
      },
    ];

    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      tasks: TASKS,
      gapExplanations,
      corrections: [correction("x1", T1, T1030, "NONE", null, null, "2026-09-14T10:31:00.000Z")],
    });

    const intention = intentionAt(timeline, T1015);
    assert.equal(intention?.targetScope, "UNLINKED");
    assert.equal(intention?.linkType, "EXPLICIT");

    const gapProv = provenanceOf(timeline, T1015, "user_gap_explanation");
    assert.equal(gapProv.length, 1);
    assert.equal(gapProv[0]!.role, "CONFLICTING");
    assert.equal(gapProv[0]!.targetTaskId, "t1");
  });

  it("R1: permission invariance — input array order never changes output", () => {
    const base = {
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      segments: [segment("seg-1", T1, "2026-09-14T10:45:00.000Z")],
    };
    const contexts = [context("c1", "t2", T1), context("c2", "t3", "2026-09-14T10:33:00.000Z", T1045)];
    const corrections = [
      correction("corr-1", T1, T1030, "TASK", "t1", "Task Alpha", "2026-09-14T10:05:00.000Z"),
      correction("corr-2", T1045, "2026-09-14T11:00:00.000Z", "NONE", null, null, "2026-09-14T10:50:00.000Z"),
    ];

    const straight = buildEvidenceTimeline({
      ...base,
      workContexts: contexts,
      corrections,
    });
    const shuffled = buildEvidenceTimeline({
      ...base,
      workContexts: [...contexts].reverse(),
      corrections: [...corrections].reverse(),
    });

    assert.deepEqual(straight.blocks, shuffled.blocks);
    assert.deepEqual(straight.coverageSummary, shuffled.coverageSummary);
  });

  it("Cross-day clipping: a context spanning midnight applies only inside the window", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: "2026-09-14T23:30:00.000Z",
      windowEnd: "2026-09-15T00:30:00.000Z",
      tasks: TASKS,
      workContexts: [context("c1", "t1", "2026-09-14T23:00:00.000Z", "2026-09-15T00:20:00.000Z")],
    });

    assert.equal(intentionAt(timeline, "2026-09-14T23:45:00.000Z")?.taskId, "t1");
    assert.equal(intentionAt(timeline, "2026-09-15T00:10:00.000Z")?.taskId, "t1");
    assert.equal(intentionAt(timeline, "2026-09-15T00:25:00.000Z"), null);
  });

  it("R1/R15: corrections survive recomputation; summary stays double-count safe", () => {
    const options = {
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      segments: [segment("seg-1", T1, T1030)],
      tasks: TASKS,
      corrections: [correction("x1", T1, T1030, "TASK", "t1", "Task Alpha", "2026-09-14T10:31:00.000Z")],
      checkIns: [
        checkIn({
          id: "ci-1",
          taskId: "t1",
          windowStart: T1,
          windowEnd: T1030,
          createdAt: T1030,
        }),
      ],
    };

    const first = buildEvidenceTimeline(options);
    const second = buildEvidenceTimeline(options);
    assert.deepEqual(first.blocks, second.blocks);
    assert.equal(intentionAt(first, T1015)?.taskId, "t1");

    const s = first.coverageSummary;
    assert.equal(
      s.observedSeconds + s.reportedSeconds + s.observedReportedSeconds + s.unknownSeconds + s.explainedGapSeconds,
      first.totalDurationSeconds,
    );
    assert.equal(s.observedReportedSeconds, 1800);
  });
});

describe("Phase 1: canonical segmentation contract", () => {
  it("R4: TIMELINE_SEGMENTATION_OPTIONS matches verified production timeline values", () => {
    assert.deepEqual(TIMELINE_SEGMENTATION_OPTIONS, {
      maxGapMs: 120_000,
      minBreakMs: 180_000,
      transientThresholdMs: 15_000,
      maxBreakMs: 7_200_000,
    });
  });

  it("R4: evidence uses canonical options — a 180s event gap splits observations (defaults would bridge it)", () => {
    const events = [
      {
        id: "e1",
        bucketId: "b1",
        timestamp: "2026-09-14T10:00:00.000Z",
        duration: 60,
        data: { application: "Code.exe", windowTitle: "service.ts" },
        externalId: "ext-e1",
        source: "desktop" as const,
        watcher: "window" as const,
      },
      {
        id: "e2",
        bucketId: "b1",
        timestamp: "2026-09-14T10:04:00.000Z",
        duration: 60,
        data: { application: "Code.exe", windowTitle: "service.ts" },
        externalId: "ext-e2",
        source: "desktop" as const,
        watcher: "window" as const,
      },
    ];

    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      events,
    });

    assert.equal(timeline.blocks.length, 4, "180s gap must not be bridged with canonical 120s max gap");
    assert.equal(timeline.blocks[0]!.coverage, "OBSERVED");
    assert.equal(timeline.blocks[1]!.coverage, "UNKNOWN");
    assert.equal(timeline.blocks[2]!.coverage, "OBSERVED");
    assert.equal(timeline.blocks[3]!.coverage, "UNKNOWN");
    assert.equal(timeline.blocks[0]!.durationSeconds, 60);
    assert.equal(timeline.blocks[1]!.durationSeconds, 180);
    assert.equal(timeline.blocks[2]!.durationSeconds, 60);
  });

  it("R4: a 90s event gap bridges into one observation (canonical max gap)", () => {
    const events = [
      {
        id: "e1",
        bucketId: "b1",
        timestamp: "2026-09-14T10:00:00.000Z",
        duration: 60,
        data: { application: "Code.exe", windowTitle: "service.ts" },
        externalId: "ext-e1",
        source: "desktop" as const,
        watcher: "window" as const,
      },
      {
        id: "e2",
        bucketId: "b1",
        timestamp: "2026-09-14T10:02:30.000Z",
        duration: 60,
        data: { application: "Code.exe", windowTitle: "service.ts" },
        externalId: "ext-e2",
        source: "desktop" as const,
        watcher: "window" as const,
      },
    ];

    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      events,
    });

    assert.equal(timeline.blocks.length, 2);
    assert.equal(timeline.blocks[0]!.coverage, "OBSERVED");
    assert.equal(timeline.blocks[1]!.coverage, "UNKNOWN");
  });

  it("R4: evidence shortcut (events) matches production timeline segmentation (segments) exactly", () => {
    const events = [
      {
        id: "e1",
        bucketId: "b1",
        timestamp: "2026-09-14T10:00:00.000Z",
        duration: 60,
        data: { application: "Code.exe", windowTitle: "service.ts" },
        externalId: "ext-e1",
        source: "desktop" as const,
        watcher: "window" as const,
      },
      {
        id: "e2",
        bucketId: "b1",
        timestamp: "2026-09-14T10:04:00.000Z",
        duration: 60,
        data: { application: "Code.exe", windowTitle: "service.ts" },
        externalId: "ext-e2",
        source: "desktop" as const,
        watcher: "window" as const,
      },
    ];

    const viaEvents = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      events,
    });

    const timelineSegments = aggregateActivitySegments(events, TIMELINE_SEGMENTATION_OPTIONS);
    const viaSegments = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      segments: timelineSegments,
    });

    assert.deepEqual(viaEvents.blocks, viaSegments.blocks);
    assert.deepEqual(viaEvents.coverageSummary, viaSegments.coverageSummary);
  });
});

/**
 * Phase 1 acceptance-review additions. These pin the edges called out by the
 * adversarial review: the untested SUPPORTING role, the R6 invalid-window
 * branches, session/telemetry cross-day clipping, and the distinction between
 * corrected-to-none (EXPLICIT UNLINKED) and a signal-free stretch (null).
 */
describe("Phase 1 acceptance review: attribution and temporal edges", () => {
  it("R7+c: context switches A→B while the session stays linked to A — SUPPORTING first, then CONFLICTING, all visible", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      segments: [segment("seg-1", T1, "2026-09-14T11:00:00.000Z")],
      tasks: TASKS,
      sessions: [session("s1", "t1", T1, "2026-09-14T11:00:00.000Z")],
      workContexts: [context("c1", "t1", T1, T1030), context("c2", "t2", T1030)],
    });

    // [10:00,10:30): context t1 agrees with the session link -> SUPPORTING.
    const first = intentionAt(timeline, T1015);
    assert.equal(first?.taskId, "t1");
    assert.equal(first?.linkType, "EXPLICIT");
    const contextFirst = provenanceOf(timeline, T1015, "work_context");
    assert.equal(contextFirst[0]?.role, "SELECTED");
    const sessionFirst = provenanceOf(timeline, T1015, "work_session");
    assert.equal(sessionFirst[0]?.role, "SUPPORTING");
    assert.equal(sessionFirst[0]?.targetTaskId, "t1");
    assert.equal(sessionFirst[0]?.targetTaskTitle, "Task Alpha");

    // [10:30,11:00): context switched to t2; the session's original task is
    // preserved as CONFLICTING, never silently dropped.
    const second = intentionAt(timeline, T1045);
    assert.equal(second?.taskId, "t2");
    const sessionSecond = provenanceOf(timeline, T1045, "work_session");
    assert.equal(sessionSecond[0]?.role, "CONFLICTING");
    assert.equal(sessionSecond[0]?.targetTaskId, "t1");
    assert.equal(sessionSecond[0]?.targetTaskTitle, "Task Alpha");
    const contextSecond = provenanceOf(timeline, T1045, "work_context");
    assert.equal(contextSecond[0]?.role, "SELECTED");
    assert.equal(contextSecond[0]?.targetTaskId, "t2");
  });

  it("R2: corrected-to-none is EXPLICIT UNLINKED; a signal-free stretch stays null (never a fabricated link)", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      tasks: TASKS,
      corrections: [correction("x1", T1, T1030, "NONE", null, null, "2026-09-14T10:31:00.000Z")],
    });

    const corrected = intentionAt(timeline, T1015);
    assert.ok(corrected, "NONE correction must produce an explicit intention, not null");
    assert.equal(corrected.targetScope, "UNLINKED");
    assert.equal(corrected.taskId, null);
    assert.equal(corrected.linkType, "EXPLICIT");

    // No signal of any kind after the correction window: null, and no block
    // ever fabricates linkType "UNKNOWN" to paper over the absence.
    assert.equal(intentionAt(timeline, T1045), null);
    assert.ok(
      timeline.blocks.every(
        (b) => b.intention === null || b.intention.linkType === "EXPLICIT",
      ),
    );
  });

  it("R6: an inverted check-in window (end < start) is excluded, never expanded", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      tasks: TASKS,
      checkIns: [
        checkIn({
          id: "ci-inverted",
          taskId: "t1",
          windowStart: T1030,
          windowEnd: T1015,
          createdAt: "2026-09-14T10:31:00.000Z",
        }),
      ],
    });

    assert.equal(timeline.coverageSummary.reportedSeconds, 0);
    assert.ok(timeline.blocks.every((b) => b.report === null && b.intention === null));
  });

  it("R6: an unparseable windowEnd behaves like a missing end — [windowStart, createdAt], never open-ended", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      tasks: TASKS,
      checkIns: [
        checkIn({
          id: "ci-bad-end",
          taskId: "t1",
          windowStart: T1,
          windowEnd: "not-a-date",
          createdAt: T1030,
        }),
      ],
    });

    assert.equal(timeline.coverageSummary.reportedSeconds, 1800);
    assert.equal(intentionAt(timeline, T1015)?.taskId, "t1");
    assert.equal(intentionAt(timeline, T1035), null);
  });

  it("R6: windowStart-only check-in with createdAt at or before start is excluded", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: WINDOW.start,
      windowEnd: WINDOW.end,
      tasks: TASKS,
      checkIns: [
        checkIn({
          id: "ci-nobound",
          taskId: "t1",
          windowStart: T1,
          windowEnd: null,
          createdAt: T1,
        }),
      ],
    });

    assert.equal(timeline.coverageSummary.reportedSeconds, 0);
    assert.ok(timeline.blocks.every((b) => b.report === null && b.intention === null));
  });

  it("Cross-day clipping: a session and its telemetry crossing midnight contribute only inside the window", () => {
    const timeline = buildEvidenceTimeline({
      windowStart: "2026-09-14T23:30:00.000Z",
      windowEnd: "2026-09-15T00:30:00.000Z",
      tasks: TASKS,
      segments: [segment("seg-1", "2026-09-14T23:45:00.000Z", "2026-09-15T00:10:00.000Z")],
      sessions: [session("s1", "t1", "2026-09-14T23:00:00.000Z", "2026-09-15T00:15:00.000Z")],
    });

    assert.equal(timeline.totalDurationSeconds, 3600);
    assert.equal(timeline.coverageSummary.observedSeconds, 1500);
    assert.equal(timeline.blocks[0]!.startTime, "2026-09-14T23:30:00.000Z");
    assert.equal(
      timeline.blocks[timeline.blocks.length - 1]!.endTime,
      "2026-09-15T00:30:00.000Z",
    );
    assert.equal(intentionAt(timeline, "2026-09-14T23:45:00.000Z")?.taskId, "t1");
    assert.equal(intentionAt(timeline, "2026-09-14T23:35:00.000Z")?.taskId, "t1");
    assert.equal(intentionAt(timeline, "2026-09-15T00:20:00.000Z"), null);
  });
});
