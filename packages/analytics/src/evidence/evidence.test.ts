import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceTimeline } from "./builder";
import type {
  TimelineSegment,
  CheckIn,
  UserGapExplanation,
  WorkSession,
  Task,
} from "@repo/types";

describe("Phase 3: Evidence & Observation Model Invariants", () => {
  const windowStart = "2026-09-14T10:00:00.000Z";
  const windowEnd = "2026-09-14T11:00:00.000Z"; // 1 hour = 3600 seconds

  it("Invariant 1: Empty interval produces UNKNOWN, never fake idle or zero", () => {
    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
    });

    assert.equal(timeline.totalDurationSeconds, 3600);
    assert.equal(timeline.blocks.length, 1);
    const block = timeline.blocks[0]!;
    assert.equal(block.coverage, "UNKNOWN");
    assert.equal(block.observation, null);
    assert.equal(block.report, null);
    assert.equal(block.durationSeconds, 3600);

    // Coverage summary check
    assert.equal(timeline.coverageSummary.unknownSeconds, 3600);
    assert.equal(timeline.coverageSummary.observedSeconds, 0);
    assert.equal(timeline.coverageSummary.coverageRatio, 0);
  });

  it("Precedence Tree: Telemetry only produces OBSERVED", () => {
    const segments: TimelineSegment[] = [
      {
        id: "seg-1",
        start: "2026-09-14T10:00:00.000Z",
        end: "2026-09-14T10:30:00.000Z",
        durationMs: 1800000,
        durationSeconds: 1800,
        source: "desktop",
        type: "application",
        application: "Code.exe",
        title: "service.ts",
        category: "focused",
      },
    ];

    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments,
    });

    assert.equal(timeline.blocks.length, 2);
    // 10:00 - 10:30: OBSERVED
    assert.equal(timeline.blocks[0]!.coverage, "OBSERVED");
    assert.equal(timeline.blocks[0]!.observation?.application, "Code.exe");
    assert.equal(timeline.blocks[0]!.observation?.category, "focused");
    assert.equal(timeline.blocks[0]!.report, null);
    assert.equal(timeline.blocks[0]!.durationSeconds, 1800);

    // 10:30 - 11:00: UNKNOWN (unobserved gap is NOT idle!)
    assert.equal(timeline.blocks[1]!.coverage, "UNKNOWN");
    assert.equal(timeline.blocks[1]!.durationSeconds, 1800);

    assert.equal(timeline.coverageSummary.observedSeconds, 1800);
    assert.equal(timeline.coverageSummary.unknownSeconds, 1800);
    assert.equal(timeline.coverageSummary.coverageRatio, 0.5);
  });

  it("Precedence Tree: Telemetry + Check-In produces OBSERVED_REPORTED", () => {
    const segments: TimelineSegment[] = [
      {
        id: "seg-1",
        start: "2026-09-14T10:00:00.000Z",
        end: "2026-09-14T10:45:00.000Z",
        durationMs: 2700000,
        durationSeconds: 2700,
        source: "desktop",
        type: "application",
        application: "Code.exe",
        title: "service.ts",
        category: "focused",
      },
    ];

    const checkIns: CheckIn[] = [
      {
        id: "ci-1",
        userId: "u1",
        workSessionId: null,
        taskId: null,
        windowStart: "2026-09-14T10:00:00.000Z",
        windowEnd: "2026-09-14T10:45:00.000Z",
        activityAssessment: "focused",
        alignment: "yes",
        reasons: [],
        state: "motivated",
        energy: "high",
        focus: "focused",
        note: "Great progress on React Query",
        questionVersion: "v1",
        source: "extension_hourly",
        intent: "React Query",
        progress: true,
        blocker: null,
        productive: true,
        outcome: null,
        createdAt: "2026-09-14T10:45:00.000Z",
      },
    ];

    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments,
      checkIns,
    });

    assert.equal(timeline.blocks.length, 2);
    // 10:00 - 10:45: OBSERVED_REPORTED
    const b1 = timeline.blocks[0]!;
    assert.equal(b1.coverage, "OBSERVED_REPORTED");
    assert.equal(b1.observation?.application, "Code.exe");
    assert.equal(b1.report?.source, "CHECK_IN");
    assert.equal(b1.report?.assessment, "focused");
    assert.equal(b1.report?.alignment, "yes");
    assert.equal(b1.durationSeconds, 2700);

    // 10:45 - 11:00: UNKNOWN
    assert.equal(timeline.blocks[1]!.coverage, "UNKNOWN");
    assert.equal(timeline.blocks[1]!.durationSeconds, 900);
  });

  it("Precedence Tree: Missing telemetry explained by user becomes EXPLAINED_GAP, not distraction", () => {
    const gapExplanations: UserGapExplanation[] = [
      {
        id: "gap-1",
        gapId: "g-1",
        userId: "u1",
        startTime: "2026-09-14T10:15:00.000Z",
        endTime: "2026-09-14T10:45:00.000Z",
        explanationType: "OFFLINE_WORK",
        description: "Had a phone call with client",
        offlineWorkContext: "client call",
        associatedTaskId: null,
        associatedGoalId: null,
        createdAt: "2026-09-14T10:45:00.000Z",
      },
    ];

    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      gapExplanations,
    });

    // Window 10:00 - 11:00 splits into:
    // 10:00 - 10:15: UNKNOWN (900s)
    // 10:15 - 10:45: EXPLAINED_GAP (1800s)
    // 10:45 - 11:00: UNKNOWN (900s)
    assert.equal(timeline.blocks.length, 3);

    assert.equal(timeline.blocks[0]!.coverage, "UNKNOWN");
    assert.equal(timeline.blocks[0]!.durationSeconds, 900);

    const gapBlock = timeline.blocks[1]!;
    assert.equal(gapBlock.coverage, "EXPLAINED_GAP");
    assert.equal(gapBlock.durationSeconds, 1800);
    assert.equal(gapBlock.report?.source, "GAP_EXPLANATION");
    assert.equal(gapBlock.report?.gapReason, "Had a phone call with client");
    assert.equal(gapBlock.report?.offlineWorkContext, "client call");
    assert.equal(gapBlock.observation, null); // No sensor observation

    assert.equal(timeline.blocks[2]!.coverage, "UNKNOWN");
    assert.equal(timeline.blocks[2]!.durationSeconds, 900);

    assert.equal(timeline.coverageSummary.explainedGapSeconds, 1800);
    assert.equal(timeline.coverageSummary.unknownSeconds, 1800);
  });

  it("Partial Overlap: 50m check-in overlapping fragmented telemetry slices at exact boundaries", () => {
    // 10:00–10:20 telemetry (VS Code)
    // 10:20–10:40 no telemetry
    // 10:40–11:00 telemetry (Chrome)
    const segments: TimelineSegment[] = [
      {
        id: "seg-1",
        start: "2026-09-14T10:00:00.000Z",
        end: "2026-09-14T10:20:00.000Z",
        durationMs: 1200000,
        durationSeconds: 1200,
        source: "desktop",
        type: "application",
        application: "Code.exe",
        title: "1.ts",
        category: "focused",
      },
      {
        id: "seg-2",
        start: "2026-09-14T10:40:00.000Z",
        end: "2026-09-14T11:00:00.000Z",
        durationMs: 1200000,
        durationSeconds: 1200,
        source: "browser",
        type: "browser",
        application: "Google Chrome",
        title: "GitHub Docs",
        category: "browser",
      },
    ];

    // Check-in covering the entire 10:00–11:00 window
    const checkIns: CheckIn[] = [
      {
        id: "ci-full",
        userId: "u1",
        workSessionId: null,
        taskId: null,
        windowStart: "2026-09-14T10:00:00.000Z",
        windowEnd: "2026-09-14T11:00:00.000Z",
        activityAssessment: "focused",
        alignment: "yes",
        reasons: [],
        state: "neutral",
        energy: "medium",
        focus: "focused",
        note: "Full hour review",
        questionVersion: "v1",
        source: "extension_hourly",
        intent: "Learning",
        progress: true,
        blocker: null,
        productive: true,
        outcome: null,
        createdAt: "2026-09-14T11:00:00.000Z",
      },
    ];

    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments,
      checkIns,
    });

    // Must slice into 3 atomic blocks:
    // 1. 10:00 - 10:20: OBSERVED_REPORTED (VS Code + check-in)
    // 2. 10:20 - 10:40: REPORTED (check-in only, no telemetry)
    // 3. 10:40 - 11:00: OBSERVED_REPORTED (Chrome + check-in)
    assert.equal(timeline.blocks.length, 3);

    const b1 = timeline.blocks[0]!;
    assert.equal(b1.coverage, "OBSERVED_REPORTED");
    assert.equal(b1.observation?.application, "Code.exe");
    assert.equal(b1.report?.assessment, "focused");
    assert.equal(b1.durationSeconds, 1200);

    const b2 = timeline.blocks[1]!;
    assert.equal(b2.coverage, "REPORTED");
    assert.equal(b2.observation, null);
    assert.equal(b2.report?.assessment, "focused");
    assert.equal(b2.durationSeconds, 1200);

    const b3 = timeline.blocks[2]!;
    assert.equal(b3.coverage, "OBSERVED_REPORTED");
    assert.equal(b3.observation?.application, "Google Chrome");
    assert.equal(b3.report?.assessment, "focused");
    assert.equal(b3.durationSeconds, 1200);

    assert.equal(timeline.coverageSummary.observedReportedSeconds, 2400);
    assert.equal(timeline.coverageSummary.reportedSeconds, 1200);
    assert.equal(timeline.coverageSummary.unknownSeconds, 0);
    assert.equal(timeline.coverageSummary.coverageRatio, 1.0);
  });

  it("Invariant 2: Check-in subjective assessment does NOT overwrite observation category", () => {
    const segments: TimelineSegment[] = [
      {
        id: "seg-1",
        start: "2026-09-14T10:00:00.000Z",
        end: "2026-09-14T11:00:00.000Z",
        durationMs: 3600000,
        durationSeconds: 3600,
        source: "desktop",
        type: "application",
        application: "Code.exe",
        title: "main.ts",
        category: "focused", // physical classification
      },
    ];

    const checkIns: CheckIn[] = [
      {
        id: "ci-distracted",
        userId: "u1",
        workSessionId: null,
        taskId: null,
        windowStart: "2026-09-14T10:00:00.000Z",
        windowEnd: "2026-09-14T11:00:00.000Z",
        activityAssessment: "distracted", // subjective perception
        alignment: "no",
        reasons: ["Mind wandering"],
        state: "anxious",
        energy: "low",
        focus: "scattered",
        note: null,
        questionVersion: "v1",
        source: "extension_hourly",
        intent: "Work",
        progress: false,
        blocker: null,
        productive: false,
        outcome: null,
        createdAt: "2026-09-14T11:00:00.000Z",
      },
    ];

    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments,
      checkIns,
    });

    assert.equal(timeline.blocks.length, 1);
    const b = timeline.blocks[0]!;
    // Observation category remains "focused" (physical code editor active)
    assert.equal(b.observation?.category, "focused");
    // Report assessment remains "distracted" (subjective self-report)
    assert.equal(b.report?.assessment, "distracted");
    assert.equal(b.report?.alignment, "no");
    // Both survive uncorrupted
    assert.equal(b.coverage, "OBSERVED_REPORTED");
  });

  it("Invariant 5: Explicit task attribution vs unlinked attribution", () => {
    const segments: TimelineSegment[] = [
      {
        id: "seg-1",
        start: "2026-09-14T10:00:00.000Z",
        end: "2026-09-14T10:30:00.000Z",
        durationMs: 1800000,
        durationSeconds: 1800,
        source: "desktop",
        type: "application",
        application: "Code.exe",
        title: "task.ts",
        category: "focused",
      },
      {
        id: "seg-2",
        start: "2026-09-14T10:30:00.000Z",
        end: "2026-09-14T11:00:00.000Z",
        durationMs: 1800000,
        durationSeconds: 1800,
        source: "desktop",
        type: "application",
        application: "Code.exe",
        title: "unlinked.ts",
        category: "focused",
      },
    ];

    // Session explicitly linked to task-101 for the first 30m only
    const sessions: WorkSession[] = [
      {
        id: "ws-1",
        taskId: "task-101",
        startedAt: "2026-09-14T10:00:00.000Z",
        endedAt: "2026-09-14T10:30:00.000Z",
        durationSeconds: 1800,
        source: "manual",
      },
    ];

    const tasks: Task[] = [
      {
        id: "task-101",
        userId: "u1",
        title: "Implement React Query",
        description: null,
        status: "in_progress",
        priority: "high",
        plannedDurationMinutes: 30,
        dueAt: null,
        completedAt: null,
        createdAt: "2026-09-14T09:00:00.000Z",
        updatedAt: "2026-09-14T09:00:00.000Z",
      },
      {
        id: "task-202",
        userId: "u1",
        title: "Write Documentation",
        description: null,
        status: "todo",
        priority: "medium",
        plannedDurationMinutes: 30,
        dueAt: null,
        completedAt: null,
        createdAt: "2026-09-14T09:00:00.000Z",
        updatedAt: "2026-09-14T09:00:00.000Z",
      },
    ];

    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments,
      sessions,
      tasks,
    });

    assert.equal(timeline.blocks.length, 2);

    // Block 1 (10:00 - 10:30): Explicitly linked to task-101
    const b1 = timeline.blocks[0]!;
    assert.equal(b1.intention?.linkType, "EXPLICIT");
    assert.equal(b1.intention?.taskId, "task-101");
    assert.equal(b1.intention?.taskTitle, "Implement React Query");

    // Block 2 (10:30 - 11:00): Unlinked!
    // Invariant: Do NOT guess task-202 merely because it was planned!
    const b2 = timeline.blocks[1]!;
    assert.equal(b2.intention, null, "Must NOT manufacture task attribution without explicit relationship");
  });

  it("Invariant 6 & 12: Contiguous coverage invariant (sum of durations equals total)", () => {
    const segments: TimelineSegment[] = [
      {
        id: "seg-1",
        start: "2026-09-14T10:10:00.000Z",
        end: "2026-09-14T10:25:00.000Z",
        durationMs: 900000,
        durationSeconds: 900,
        source: "desktop",
        type: "application",
        application: "Code.exe",
        title: "a.ts",
        category: "focused",
      },
    ];

    const gapExplanations: UserGapExplanation[] = [
      {
        id: "gap-1",
        gapId: "g-1",
        userId: "u1",
        startTime: "2026-09-14T10:35:00.000Z",
        endTime: "2026-09-14T10:50:00.000Z",
        explanationType: "REST_BREAK",
        description: "Coffee break",
        offlineWorkContext: null,
        associatedTaskId: null,
        associatedGoalId: null,
        createdAt: "2026-09-14T10:50:00.000Z",
      },
    ];

    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments,
      gapExplanations,
    });

    // Check strict continuity: each block end equals next block start
    for (let i = 0; i < timeline.blocks.length - 1; i++) {
      assert.equal(
        timeline.blocks[i]!.endTime,
        timeline.blocks[i + 1]!.startTime,
        `Block ${i} end must match Block ${i + 1} start`,
      );
    }

    // Check sum of durations
    const sumBlockDurations = timeline.blocks.reduce((sum, b) => sum + b.durationSeconds, 0);
    assert.equal(sumBlockDurations, 3600);

    const s = timeline.coverageSummary;
    assert.equal(
      s.observedSeconds + s.reportedSeconds + s.observedReportedSeconds + s.unknownSeconds + s.explainedGapSeconds,
      timeline.totalDurationSeconds,
      "Sum of coverage states must equal total window duration",
    );
  });

  it("Invariant 7 & 13: Adjacent blocks merge ONLY when all semantic dimensions are identical", () => {
    // Two contiguous 15m segments of identical app & category
    const segments: TimelineSegment[] = [
      {
        id: "seg-1",
        start: "2026-09-14T10:00:00.000Z",
        end: "2026-09-14T10:15:00.000Z",
        durationMs: 900000,
        durationSeconds: 900,
        source: "desktop",
        type: "application",
        application: "Code.exe",
        title: "app.ts",
        category: "focused",
      },
      {
        id: "seg-2",
        start: "2026-09-14T10:15:00.000Z",
        end: "2026-09-14T10:30:00.000Z",
        durationMs: 900000,
        durationSeconds: 900,
        source: "desktop",
        type: "application",
        application: "Code.exe",
        title: "app.ts",
        category: "focused",
      },
      // Distinct app switch (Chrome)
      {
        id: "seg-3",
        start: "2026-09-14T10:30:00.000Z",
        end: "2026-09-14T10:45:00.000Z",
        durationMs: 900000,
        durationSeconds: 900,
        source: "browser",
        type: "browser",
        application: "Google Chrome",
        title: "Documentation",
        category: "browser",
      },
    ];

    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments,
    });

    // Segments 1 and 2 are identical -> merged into 1 block of 1800s (10:00–10:30)
    // Segment 3 is Chrome -> distinct block (10:30–10:45)
    // 10:45–11:00 -> UNKNOWN
    assert.equal(timeline.blocks.length, 3);
    assert.equal(timeline.blocks[0]!.durationSeconds, 1800);
    assert.equal(timeline.blocks[0]!.observation?.application, "Code.exe");

    assert.equal(timeline.blocks[1]!.durationSeconds, 900);
    assert.equal(timeline.blocks[1]!.observation?.application, "Google Chrome");

    assert.equal(timeline.blocks[2]!.durationSeconds, 900);
    assert.equal(timeline.blocks[2]!.coverage, "UNKNOWN");
  });

  it("Invariant 8: Source provenance survives transformation into evidence blocks", () => {
    const segments: TimelineSegment[] = [
      {
        id: "seg-1",
        start: "2026-09-14T10:00:00.000Z",
        end: "2026-09-14T10:30:00.000Z",
        durationMs: 1800000,
        durationSeconds: 1800,
        source: "browser",
        type: "browser",
        application: "Google Chrome",
        title: "Docs",
        category: "browser",
      },
    ];

    const checkIns: CheckIn[] = [
      {
        id: "ci-1",
        userId: "u1",
        workSessionId: null,
        taskId: null,
        windowStart: "2026-09-14T10:00:00.000Z",
        windowEnd: "2026-09-14T10:30:00.000Z",
        activityAssessment: "learning",
        alignment: "yes",
        reasons: [],
        state: "calm",
        energy: "high",
        focus: "focused",
        note: null,
        questionVersion: "v1",
        source: "extension_hourly",
        intent: "Docs",
        progress: true,
        blocker: null,
        productive: true,
        outcome: null,
        createdAt: "2026-09-14T10:30:00.000Z",
      },
    ];

    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments,
      checkIns,
    });

    const b = timeline.blocks[0]!;
    assert.equal(b.provenance.length, 2);
    const sources = b.provenance.map((p) => p.source);
    assert.ok(sources.includes("browser_telemetry"));
    assert.ok(sources.includes("user_check_in"));

    const authorities = b.provenance.map((p) => p.authority);
    assert.ok(authorities.includes("SYSTEM"));
    assert.ok(authorities.includes("USER"));
  });

  it("Invariant 10: Task completion outcome is decoupled from activity observation", () => {
    const segments: TimelineSegment[] = [
      {
        id: "seg-1",
        start: "2026-09-14T10:00:00.000Z",
        end: "2026-09-14T11:00:00.000Z",
        durationMs: 3600000,
        durationSeconds: 3600,
        source: "desktop",
        type: "application",
        application: "Code.exe",
        title: "impl.ts",
        category: "focused",
      },
    ];

    // Task completed exactly at 10:45
    const tasks: Task[] = [
      {
        id: "t-done",
        userId: "u1",
        title: "Finish Cache Hook",
        description: null,
        status: "done",
        priority: "high",
        plannedDurationMinutes: 45,
        dueAt: null,
        completedAt: "2026-09-14T10:45:00.000Z",
        createdAt: "2026-09-14T09:00:00.000Z",
        updatedAt: "2026-09-14T10:45:00.000Z",
      },
    ];

    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments,
      tasks,
    });

    // The boundary slicing engine slices at completedAt (10:45):
    // Block 1 (10:00–10:45): observation present, outcome null
    // Block 2 (10:45–11:00): observation present, outcome has task completion!
    assert.equal(timeline.blocks.length, 2);

    const b1 = timeline.blocks[0]!;
    assert.equal(b1.outcome, null);

    const b2 = timeline.blocks[1]!;
    assert.notEqual(b2.outcome, null);
    assert.equal(b2.outcome?.taskId, "t-done");
    assert.equal(b2.outcome?.taskStatus, "done");
    assert.equal(b2.outcome?.taskCompletedAt, "2026-09-14T10:45:00.000Z");
  });

  it("Invariant 11: Determinism — input order invariance", () => {
    const segA: TimelineSegment = {
      id: "seg-a",
      start: "2026-09-14T10:00:00.000Z",
      end: "2026-09-14T10:30:00.000Z",
      durationMs: 1800000,
      durationSeconds: 1800,
      source: "desktop",
      type: "application",
      application: "Code.exe",
      title: "1.ts",
      category: "focused",
    };

    const segB: TimelineSegment = {
      id: "seg-b",
      start: "2026-09-14T10:30:00.000Z",
      end: "2026-09-14T11:00:00.000Z",
      durationMs: 1800000,
      durationSeconds: 1800,
      source: "browser",
      type: "browser",
      application: "Chrome",
      title: "2.ts",
      category: "browser",
    };

    const ciA: CheckIn = {
      id: "ci-a",
      userId: "u1",
      workSessionId: null,
      taskId: null,
      windowStart: "2026-09-14T10:00:00.000Z",
      windowEnd: "2026-09-14T10:30:00.000Z",
      activityAssessment: "focused",
      alignment: "yes",
      reasons: [],
      state: "calm",
      energy: "high",
      focus: "focused",
      note: null,
      questionVersion: "v1",
      source: "extension",
      intent: null,
      progress: true,
      blocker: null,
      productive: true,
      outcome: null,
      createdAt: "2026-09-14T10:30:00.000Z",
    };

    const ciB: CheckIn = {
      id: "ci-b",
      userId: "u1",
      workSessionId: null,
      taskId: null,
      windowStart: "2026-09-14T10:30:00.000Z",
      windowEnd: "2026-09-14T11:00:00.000Z",
      activityAssessment: "learning",
      alignment: "yes",
      reasons: [],
      state: "calm",
      energy: "medium",
      focus: "focused",
      note: null,
      questionVersion: "v1",
      source: "extension",
      intent: null,
      progress: true,
      blocker: null,
      productive: true,
      outcome: null,
      createdAt: "2026-09-14T11:00:00.000Z",
    };

    // Run 1: Order A then B
    const t1 = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments: [segA, segB],
      checkIns: [ciA, ciB],
    });

    // Run 2: Order B then A (reversed inputs!)
    const t2 = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments: [segB, segA],
      checkIns: [ciB, ciA],
    });

    assert.deepEqual(t1, t2, "Timeline output must be 100% identical regardless of input ordering");
  });

  it("Correction 1: Merging preserves all semantic dimensions without losing report/intention/observation differences", () => {
    // Two contiguous 30m check-ins with identical assessment 'focused' BUT different alignment ('yes' vs 'no')
    const ci1: CheckIn = {
      id: "ci-align-yes",
      userId: "u1",
      workSessionId: null,
      taskId: null,
      windowStart: "2026-09-14T10:00:00.000Z",
      windowEnd: "2026-09-14T10:30:00.000Z",
      activityAssessment: "focused",
      alignment: "yes", // ALIGNED
      reasons: [],
      state: "calm",
      energy: "high",
      focus: "focused",
      note: null,
      questionVersion: "v1",
      source: "extension",
      intent: null,
      progress: true,
      blocker: null,
      productive: true,
      outcome: null,
      createdAt: "2026-09-14T10:30:00.000Z",
    };

    const ci2: CheckIn = {
      id: "ci-align-no",
      userId: "u1",
      workSessionId: null,
      taskId: null,
      windowStart: "2026-09-14T10:30:00.000Z",
      windowEnd: "2026-09-14T11:00:00.000Z",
      activityAssessment: "focused",
      alignment: "no", // NOT ALIGNED
      reasons: [],
      state: "calm",
      energy: "high",
      focus: "focused",
      note: null,
      questionVersion: "v1",
      source: "extension",
      intent: null,
      progress: true,
      blocker: null,
      productive: true,
      outcome: null,
      createdAt: "2026-09-14T11:00:00.000Z",
    };

    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      checkIns: [ci1, ci2],
    });

    // Invariant: Because alignment differed ('yes' vs 'no'), the two blocks must NOT merge into one!
    assert.equal(timeline.blocks.length, 2, "Blocks with different alignment must NOT be merged");
    assert.equal(timeline.blocks[0]!.report?.alignment, "yes");
    assert.equal(timeline.blocks[1]!.report?.alignment, "no");

    // Same check for energy difference
    const ciEnergyLow: CheckIn = { ...ci1, energy: "low" };
    const timelineEnergy = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      checkIns: [ci1, ciEnergyLow],
    });
    assert.equal(timelineEnergy.blocks.length, 2, "Blocks with different energy must NOT be merged");
  });

  it("Correction 2: Screen lock break category does NOT set isAfk true; only explicit AFK sets isAfk true", () => {
    // 1. Screen lock event (e.g. LockApp.exe) has category = "break" but is NOT an OS AFK event
    const lockScreenSeg: TimelineSegment = {
      id: "seg-lock",
      start: "2026-09-14T10:00:00.000Z",
      end: "2026-09-14T10:30:00.000Z",
      durationMs: 1800000,
      durationSeconds: 1800,
      source: "desktop",
      type: "application",
      isAfk: false, // NOT AFK
      application: "LockApp.exe",
      title: "Windows Default Lock Screen",
      category: "break", // Classified as break by category rules
    };

    // 2. Explicit OS AFK event has isAfk = true
    const osAfkSeg: TimelineSegment = {
      id: "seg-afk",
      start: "2026-09-14T10:30:00.000Z",
      end: "2026-09-14T11:00:00.000Z",
      durationMs: 1800000,
      durationSeconds: 1800,
      source: "desktop",
      type: "break",
      isAfk: true, // Explicit OS AFK
      application: "Away from Keyboard",
      title: "Away from keyboard",
      category: "break",
    };

    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments: [lockScreenSeg, osAfkSeg],
    });

    assert.equal(timeline.blocks.length, 2);

    // Block 1 (LockApp.exe): category is "break", but isAfk MUST BE FALSE
    const b1 = timeline.blocks[0]!;
    assert.equal(b1.observation?.category, "break");
    assert.equal(b1.observation?.isAfk, false, "Screen lock must NOT be labeled isAfk = true");
    assert.equal(b1.observation?.application, "LockApp.exe");

    // Block 2 (OS AFK): category is "break", and isAfk MUST BE TRUE
    const b2 = timeline.blocks[1]!;
    assert.equal(b2.observation?.category, "break");
    assert.equal(b2.observation?.isAfk, true, "Explicit OS AFK sensor must have isAfk = true");
    assert.equal(b2.observation?.application, "Away from Keyboard");
  });

  it("Correction 3: Deterministic tie-breaking and multi-source provenance preservation under equal overlapping segments", () => {
    // Overlapping telemetry across the EXACT SAME interval (10:00–10:20)
    const desktopSeg: TimelineSegment = {
      id: "seg-desktop",
      start: "2026-09-14T10:00:00.000Z",
      end: "2026-09-14T10:20:00.000Z",
      durationMs: 1200000,
      durationSeconds: 1200,
      source: "desktop",
      type: "application",
      application: "Google Chrome",
      title: "Google Chrome",
      category: "focused",
    };

    const browserSeg: TimelineSegment = {
      id: "seg-browser",
      start: "2026-09-14T10:00:00.000Z",
      end: "2026-09-14T10:20:00.000Z",
      durationMs: 1200000,
      durationSeconds: 1200,
      source: "browser",
      type: "browser",
      application: "Google Chrome",
      title: "github.com/org/repo",
      domain: "github.com",
      category: "focused",
    };

    // Run A: desktop then browser
    const timelineA = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments: [desktopSeg, browserSeg],
    });

    // Run B: browser then desktop (reversed array order!)
    const timelineB = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments: [browserSeg, desktopSeg],
    });

    // 1. Primary observation selection must be 100% identical regardless of input ordering
    assert.equal(timelineA.blocks.length, timelineB.blocks.length);
    assert.equal(
      timelineA.blocks[0]!.observation?.title,
      timelineB.blocks[0]!.observation?.title,
      "Primary observation must be deterministic regardless of input array order",
    );
    // Desktop takes canonical source priority over browser
    assert.equal(timelineA.blocks[0]!.observation?.title, "Google Chrome");
    assert.equal(timelineB.blocks[0]!.observation?.title, "Google Chrome");

    // 2. Option B: Multi-source provenance preservation
    // Both desktop_telemetry and browser_telemetry must be preserved in provenance
    const provA = timelineA.blocks[0]!.provenance;
    const provB = timelineB.blocks[0]!.provenance;

    const sourcesA = provA.map((p) => p.source);
    const sourcesB = provB.map((p) => p.source);

    assert.ok(sourcesA.includes("desktop_telemetry"), "Must preserve desktop telemetry in provenance");
    assert.ok(sourcesA.includes("browser_telemetry"), "Must preserve concurrent browser telemetry in provenance");
    assert.deepEqual(sourcesA, sourcesB, "Provenance must be identical regardless of input order");

    // 3. Identical tie-breaker test for same-source segments (lexicographical app/title/id)
    const segAppA: TimelineSegment = {
      id: "seg-1",
      start: "2026-09-14T10:00:00.000Z",
      end: "2026-09-14T10:20:00.000Z",
      durationMs: 1200000,
      durationSeconds: 1200,
      source: "desktop",
      type: "application",
      application: "Alpha.exe",
      title: "Window A",
      category: "focused",
    };
    const segAppB: TimelineSegment = {
      id: "seg-2",
      start: "2026-09-14T10:00:00.000Z",
      end: "2026-09-14T10:20:00.000Z",
      durationMs: 1200000,
      durationSeconds: 1200,
      source: "desktop",
      type: "application",
      application: "Beta.exe",
      title: "Window B",
      category: "focused",
    };

    const run1 = buildEvidenceTimeline({ windowStart, windowEnd, segments: [segAppA, segAppB] });
    const run2 = buildEvidenceTimeline({ windowStart, windowEnd, segments: [segAppB, segAppA] });

    assert.equal(
      run1.blocks[0]!.observation?.application,
      run2.blocks[0]!.observation?.application,
      "Same-source tie-breaking must be deterministic under input reversal",
    );
    assert.equal(run1.blocks[0]!.observation?.application, "Alpha.exe");
  });

  it("Test A: Check-in ordering — competing check-ins with identical boundaries produce deterministic output under input reversal", () => {
    const ciA: CheckIn = {
      id: "ci-1",
      userId: "u1",
      workSessionId: null,
      taskId: null,
      windowStart: "2026-09-14T10:00:00.000Z",
      windowEnd: "2026-09-14T10:30:00.000Z",
      activityAssessment: "focused",
      alignment: "yes",
      reasons: [],
      state: "calm",
      energy: "high",
      focus: "focused",
      note: "Note A",
      questionVersion: "v1",
      source: "extension",
      intent: null,
      progress: true,
      blocker: null,
      productive: true,
      outcome: null,
      createdAt: "2026-09-14T10:30:00.000Z",
    };

    const ciB: CheckIn = {
      id: "ci-2",
      userId: "u1",
      workSessionId: null,
      taskId: null,
      windowStart: "2026-09-14T10:00:00.000Z",
      windowEnd: "2026-09-14T10:30:00.000Z",
      activityAssessment: "learning",
      alignment: "no",
      reasons: [],
      state: "calm",
      energy: "low",
      focus: "scattered",
      note: "Note B",
      questionVersion: "v1",
      source: "extension",
      intent: null,
      progress: false,
      blocker: null,
      productive: false,
      outcome: null,
      createdAt: "2026-09-14T10:30:00.000Z",
    };

    const runA = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      checkIns: [ciA, ciB],
    });

    const runB = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      checkIns: [ciB, ciA],
    });

    assert.deepEqual(runA, runB, "Check-in ordering must be invariant to input array order");
    assert.equal(runA.blocks[0]!.report?.note, "Note A", "Stable tie-breaker selects ci-1 deterministically");
  });

  it("Test B: Gap explanation ordering — competing explanations with identical boundaries produce deterministic output under input reversal", () => {
    const gapA: UserGapExplanation = {
      id: "gap-1",
      gapId: "g-1",
      userId: "u1",
      startTime: "2026-09-14T10:00:00.000Z",
      endTime: "2026-09-14T10:30:00.000Z",
      explanationType: "away",
      description: "Doctor appointment",
      offlineWorkContext: null,
      associatedTaskId: null,
      associatedGoalId: null,
      createdAt: "2026-09-14T10:30:00.000Z",
    };

    const gapB: UserGapExplanation = {
      id: "gap-2",
      gapId: "g-2",
      userId: "u1",
      startTime: "2026-09-14T10:00:00.000Z",
      endTime: "2026-09-14T10:30:00.000Z",
      explanationType: "away",
      description: "Phone call",
      offlineWorkContext: null,
      associatedTaskId: null,
      associatedGoalId: null,
      createdAt: "2026-09-14T10:30:00.000Z",
    };

    const runA = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      gapExplanations: [gapA, gapB],
    });

    const runB = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      gapExplanations: [gapB, gapA],
    });

    assert.deepEqual(runA, runB, "Gap explanation ordering must be invariant to input array order");
    assert.equal(runA.blocks[0]!.report?.gapReason, "Doctor appointment", "Stable tie-breaker selects gap-1 deterministically");
  });

  it("Test C: Work-session ordering — competing sessions with identical boundaries produce deterministic intention under input reversal", () => {
    const sessA: WorkSession = {
      id: "sess-1",
      userId: "u1",
      taskId: "task-alpha",
      taskTitle: "Alpha Task",
      goalTitle: "Goal 1",
      startedAt: "2026-09-14T10:00:00.000Z",
      endedAt: "2026-09-14T10:30:00.000Z",
      durationSeconds: 1800,
      source: "manual",
    };

    const sessB: WorkSession = {
      id: "sess-2",
      userId: "u1",
      taskId: "task-beta",
      taskTitle: "Beta Task",
      goalTitle: "Goal 2",
      startedAt: "2026-09-14T10:00:00.000Z",
      endedAt: "2026-09-14T10:30:00.000Z",
      durationSeconds: 1800,
      source: "manual",
    };

    const runA = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      sessions: [sessA, sessB],
    });

    const runB = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      sessions: [sessB, sessA],
    });

    assert.deepEqual(runA, runB, "Work session ordering must be invariant to input array order");
    assert.equal(runA.blocks[0]!.intention?.taskId, "task-alpha", "Stable tie-breaker selects sess-1 deterministically");
  });

  it("Test D: Outcome ordering — multiple completed tasks with identical completion times produce deterministic outcome under input reversal", () => {
    const taskA: Task = {
      id: "task-1",
      userId: "u1",
      title: "First Task",
      description: null,
      status: "done",
      priority: "high",
      plannedDurationMinutes: 30,
      dueAt: null,
      completedAt: "2026-09-14T10:15:00.000Z",
      createdAt: "2026-09-14T09:00:00.000Z",
      updatedAt: "2026-09-14T10:15:00.000Z",
    };

    const taskB: Task = {
      id: "task-2",
      userId: "u1",
      title: "Second Task",
      description: null,
      status: "done",
      priority: "medium",
      plannedDurationMinutes: 30,
      dueAt: null,
      completedAt: "2026-09-14T10:15:00.000Z",
      createdAt: "2026-09-14T09:00:00.000Z",
      updatedAt: "2026-09-14T10:15:00.000Z",
    };

    const runA = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      tasks: [taskA, taskB],
    });

    const runB = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      tasks: [taskB, taskA],
    });

    assert.deepEqual(runA, runB, "Outcome representation must be invariant to input array order");
    // In block 1 (10:00-10:15), outcome is null
    // In block 2 (10:15-11:00), outcome is task-1
    assert.equal(runA.blocks[1]!.outcome?.taskId, "task-1", "Stable tie-breaker selects task-1 deterministically");
  });

  it("Test E: Unknown telemetry source provenance — source 'unknown' is mapped to 'unknown_telemetry', never falsely to desktop", () => {
    const segUnknown: TimelineSegment = {
      id: "seg-unk-1",
      start: "2026-09-14T10:00:00.000Z",
      end: "2026-09-14T10:30:00.000Z",
      durationMs: 1800000,
      durationSeconds: 1800,
      source: "unknown",
      type: "application",
      application: "UnknownApp",
      title: "Unknown Window",
      category: "focused",
    };

    const timeline = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments: [segUnknown],
    });

    assert.equal(timeline.blocks.length, 2); // 10:00-10:30 observed, 10:30-11:00 unknown
    const block0 = timeline.blocks[0]!;
    assert.equal(block0.coverage, "OBSERVED");
    assert.ok(
      block0.provenance.some((p) => p.source === "unknown_telemetry"),
      "Must map unknown source to unknown_telemetry provenance",
    );
    assert.strictEqual(
      block0.provenance.some((p) => p.source === "desktop_telemetry"),
      false,
      "Unknown telemetry must NOT be mislabeled as desktop_telemetry",
    );
  });

  it("Test F: Provenance order invariance with unknown source — desktop and unknown overlapping segments produce identical output regardless of input order", () => {
    const segDesktop: TimelineSegment = {
      id: "seg-desk-1",
      start: "2026-09-14T10:00:00.000Z",
      end: "2026-09-14T10:30:00.000Z",
      durationMs: 1800000,
      durationSeconds: 1800,
      source: "desktop",
      type: "application",
      application: "VSCode",
      title: "index.ts",
      category: "focused",
    };

    const segUnknown: TimelineSegment = {
      id: "seg-unk-2",
      start: "2026-09-14T10:00:00.000Z",
      end: "2026-09-14T10:30:00.000Z",
      durationMs: 1800000,
      durationSeconds: 1800,
      source: "unknown",
      type: "application",
      application: "GenericProcess",
      title: "Worker",
      category: "focused",
    };

    const timelineA = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments: [segDesktop, segUnknown],
    });

    const timelineB = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments: [segUnknown, segDesktop],
    });

    assert.deepEqual(timelineA, timelineB, "Timeline output must be order-invariant with desktop and unknown segments");
    const prov = timelineA.blocks[0]!.provenance;
    const sources = prov.map((p) => p.source);
    assert.ok(sources.includes("desktop_telemetry"), "Must represent desktop_telemetry in provenance");
    assert.ok(sources.includes("unknown_telemetry"), "Must represent unknown_telemetry in provenance");
    assert.equal(timelineA.blocks[0]!.observation?.application, "VSCode", "Desktop retains source priority over unknown");
  });

  it("Test G: Three-source provenance — desktop, browser, and unknown covering the same interval preserve all 3 source identities and remain order-invariant", () => {
    const segDesktop: TimelineSegment = {
      id: "seg-desk-3",
      start: "2026-09-14T10:00:00.000Z",
      end: "2026-09-14T10:30:00.000Z",
      durationMs: 1800000,
      durationSeconds: 1800,
      source: "desktop",
      type: "application",
      application: "Code.exe",
      title: "Project",
      category: "focused",
    };

    const segBrowser: TimelineSegment = {
      id: "seg-brow-3",
      start: "2026-09-14T10:00:00.000Z",
      end: "2026-09-14T10:30:00.000Z",
      durationMs: 1800000,
      durationSeconds: 1800,
      source: "browser",
      type: "browser",
      application: "Google Chrome",
      title: "Documentation",
      domain: "github.com",
      category: "browser",
    };

    const segUnknown: TimelineSegment = {
      id: "seg-unk-3",
      start: "2026-09-14T10:00:00.000Z",
      end: "2026-09-14T10:30:00.000Z",
      durationMs: 1800000,
      durationSeconds: 1800,
      source: "unknown",
      type: "application",
      application: "SystemDaemon",
      title: "Sync",
      category: "focused",
    };

    const timeline1 = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments: [segDesktop, segBrowser, segUnknown],
    });

    const timeline2 = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments: [segUnknown, segDesktop, segBrowser],
    });

    const timeline3 = buildEvidenceTimeline({
      windowStart,
      windowEnd,
      segments: [segBrowser, segUnknown, segDesktop],
    });

    assert.deepEqual(timeline1, timeline2, "Timeline 1 and 2 must be identical");
    assert.deepEqual(timeline1, timeline3, "Timeline 1 and 3 must be identical");

    const sources = timeline1.blocks[0]!.provenance.map((p) => p.source).sort();
    assert.deepEqual(
      sources,
      ["browser_telemetry", "desktop_telemetry", "unknown_telemetry"].sort(),
      "Provenance must contain exactly the 3 source-level telemetry identities",
    );
  });
});
