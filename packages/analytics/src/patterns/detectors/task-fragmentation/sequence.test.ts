import { test, describe } from "node:test";
import assert from "node:assert";
import type { TemporalEvidenceBlock, EvidenceCoverageState } from "@repo/types";
import {
  isAuthoritativeTaskBlock,
  classifyInterveningBlock,
  segmentTaskExecutionEpisodes,
  findAuthoritativeTaskIds,
  sortEvidenceBlocks,
  isDifferentCalendarDay,
} from "./sequence";

describe("Detector 2: sequence.ts", () => {
  const baseBlock = (id: string, start: string, end: string, durationSeconds: number): TemporalEvidenceBlock => ({
    id,
    startTime: start,
    endTime: end,
    durationSeconds,
    coverage: "OBSERVED",
    provenance: [{ source: "desktop_telemetry", authority: "SYSTEM" }],
    observation: null,
    report: null,
    intention: null,
    outcome: null,
  });

  const taskBlock = (
    id: string,
    start: string,
    end: string,
    durationSeconds: number,
    taskId: string,
    coverage: EvidenceCoverageState = "OBSERVED"
  ): TemporalEvidenceBlock => ({
    ...baseBlock(id, start, end, durationSeconds),
    coverage,
    observation: {
      application: "Code.exe",
      title: "src/index.ts",
      cleanTitle: "src/index.ts",
      domain: null,
      category: "focused",
      isAfk: false,
      rawEventCount: 10,
    },
    intention: {
      targetScope: "TASK",
      taskId,
      taskTitle: `Task ${taskId}`,
      linkType: "EXPLICIT",
    },
  });

  const breakBlock = (
    id: string,
    start: string,
    end: string,
    durationSeconds: number
  ): TemporalEvidenceBlock => ({
    ...baseBlock(id, start, end, durationSeconds),
    observation: {
      application: "LockScreen",
      title: "Screen Locked",
      cleanTitle: "Screen Locked",
      domain: null,
      category: "break",
      isAfk: true,
      rawEventCount: 1,
    },
  });

  const unknownBlock = (
    id: string,
    start: string,
    end: string,
    durationSeconds: number
  ): TemporalEvidenceBlock => ({
    ...baseBlock(id, start, end, durationSeconds),
    coverage: "UNKNOWN",
  });

  const explainedGapBlock = (
    id: string,
    start: string,
    end: string,
    durationSeconds: number
  ): TemporalEvidenceBlock => ({
    ...baseBlock(id, start, end, durationSeconds),
    coverage: "EXPLAINED_GAP",
    report: {
      source: "GAP_EXPLANATION",
      reportingWindow: { start, end },
      gapReason: "Lunch break away from desk",
      authority: "USER",
    },
  });

  test("isAuthoritativeTaskBlock requires EXPLICIT link and observed coverage", () => {
    const valid = taskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-1");
    assert.strictEqual(isAuthoritativeTaskBlock(valid, "task-1"), true);
    assert.strictEqual(isAuthoritativeTaskBlock(valid, "task-2"), false);

    // Inferred link is not authoritative
    const inferred = { ...valid, intention: { ...valid.intention!, linkType: "INFERRED" as const } };
    assert.strictEqual(isAuthoritativeTaskBlock(inferred, "task-1"), false);

    // UNKNOWN coverage is never active task execution
    const unknown = { ...valid, coverage: "UNKNOWN" as const };
    assert.strictEqual(isAuthoritativeTaskBlock(unknown, "task-1"), false);

    // EXPLAINED_GAP is unobserved, so not physical execution
    const explained = { ...valid, coverage: "EXPLAINED_GAP" as const };
    assert.strictEqual(isAuthoritativeTaskBlock(explained, "task-1"), false);
  });

  test("findAuthoritativeTaskIds extracts sorted distinct task IDs", () => {
    const blocks = [
      taskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-b"),
      taskBlock("b2", "2026-09-01T11:00:00Z", "2026-09-01T11:30:00Z", 1800, "task-a"),
      taskBlock("b3", "2026-09-01T12:00:00Z", "2026-09-01T12:30:00Z", 1800, "task-b"),
      breakBlock("b4", "2026-09-01T10:30:00Z", "2026-09-01T11:00:00Z", 1800),
    ];
    const taskIds = findAuthoritativeTaskIds(blocks);
    assert.deepStrictEqual(taskIds, ["task-a", "task-b"]);
  });

  test("classifyInterveningBlock assigns mutually exclusive categories", () => {
    const brk = breakBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:10:00Z", 600);
    assert.deepStrictEqual(classifyInterveningBlock(brk, "task-1"), { kind: "break", isKnown: true });

    const other = taskBlock("b2", "2026-09-01T10:10:00Z", "2026-09-01T10:20:00Z", 600, "task-2");
    assert.deepStrictEqual(classifyInterveningBlock(other, "task-1"), { kind: "other_task", isKnown: true });

    const exp = explainedGapBlock("b3", "2026-09-01T10:20:00Z", "2026-09-01T10:30:00Z", 600);
    assert.deepStrictEqual(classifyInterveningBlock(exp, "task-1"), { kind: "explained_gap", isKnown: true });

    const unk = unknownBlock("b4", "2026-09-01T10:30:00Z", "2026-09-01T10:40:00Z", 600);
    assert.deepStrictEqual(classifyInterveningBlock(unk, "task-1"), { kind: "unknown", isKnown: false });

    const unattr = baseBlock("b5", "2026-09-01T10:40:00Z", "2026-09-01T10:50:00Z", 600);
    unattr.observation = { application: "Explorer.exe", title: "Files", cleanTitle: "Files", domain: null, category: "general", isAfk: false, rawEventCount: 1 };
    assert.deepStrictEqual(classifyInterveningBlock(unattr, "task-1"), { kind: "unattributed_observed", isKnown: true });
  });

  test("single continuous task execution produces 0 fragmentation", () => {
    const blocks = [
      taskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-1"),
      taskBlock("b2", "2026-09-01T10:30:00Z", "2026-09-01T11:00:00Z", 1800, "task-1"),
    ];

    const episodes = segmentTaskExecutionEpisodes(blocks, "task-1");
    assert.strictEqual(episodes.length, 1);

    const ep = episodes[0]!;
    assert.strictEqual(ep.fragmentCount, 1);
    assert.strictEqual(ep.wallClockSpanSeconds, 3600);
    assert.strictEqual(ep.activeTaskDurationSeconds, 3600);
    assert.strictEqual(ep.knownInterveningGapSeconds, 0);
    assert.strictEqual(ep.unknownSeconds, 0);
    assert.strictEqual(ep.unknownFraction, 0);
    assert.strictEqual(ep.wallClockFragmentationRatio, 0);
    assert.strictEqual(ep.medianFragmentDurationSeconds, 3600);
    assert.strictEqual(ep.medianInterveningGapSeconds, null);

    // Exact conservation invariant
    assert.strictEqual(
      ep.wallClockSpanSeconds,
      ep.activeTaskDurationSeconds + ep.knownInterveningGapSeconds + ep.unknownSeconds
    );
  });

  test("multiple fragments with known intervening gaps satisfies conservation invariant", () => {
    // Task A (10:00-10:20: 1200s) -> Break (10:20-10:30: 600s) -> Task A (10:30-10:50: 1200s) -> Task B (10:50-11:00: 600s) -> Task A (11:00-11:20: 1200s)
    const blocks = [
      taskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:20:00Z", 1200, "task-A"),
      breakBlock("b2", "2026-09-01T10:20:00Z", "2026-09-01T10:30:00Z", 600),
      taskBlock("b3", "2026-09-01T10:30:00Z", "2026-09-01T10:50:00Z", 1200, "task-A"),
      taskBlock("b4", "2026-09-01T10:50:00Z", "2026-09-01T11:00:00Z", 600, "task-B"),
      taskBlock("b5", "2026-09-01T11:00:00Z", "2026-09-01T11:20:00Z", 1200, "task-A"),
    ];

    const episodes = segmentTaskExecutionEpisodes(blocks, "task-A");
    assert.strictEqual(episodes.length, 1);

    const ep = episodes[0]!;
    assert.strictEqual(ep.fragmentCount, 3);
    assert.strictEqual(ep.wallClockSpanSeconds, 4800);
    assert.strictEqual(ep.activeTaskDurationSeconds, 3600);
    assert.strictEqual(ep.knownInterveningGapSeconds, 1200);
    assert.strictEqual(ep.unknownSeconds, 0);
    assert.strictEqual(ep.unknownFraction, 0);
    // 1200 / 4800 = 0.25
    assert.strictEqual(ep.wallClockFragmentationRatio, 0.25);
    assert.strictEqual(ep.gapBreakdown.breakSeconds, 600);
    assert.strictEqual(ep.gapBreakdown.otherTaskSeconds, 600);
    assert.strictEqual(ep.gapBreakdown.unattributedObservedSeconds, 0);
    assert.strictEqual(ep.gapBreakdown.explainedGapSeconds, 0);

    // Conservation invariant
    assert.strictEqual(
      ep.wallClockSpanSeconds,
      ep.activeTaskDurationSeconds + ep.knownInterveningGapSeconds + ep.unknownSeconds
    );

    // Median fragment duration: [1200, 1200, 1200] -> 1200
    assert.strictEqual(ep.medianFragmentDurationSeconds, 1200);
    // Intervening gaps between fragments: [600, 600] -> 600
    assert.strictEqual(ep.medianInterveningGapSeconds, 600);
  });

  test("two different tasks are not merged into one task execution", () => {
    const blocks = [
      taskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-1"),
      taskBlock("b2", "2026-09-01T10:30:00Z", "2026-09-01T11:00:00Z", 1800, "task-2"),
    ];

    const ep1 = segmentTaskExecutionEpisodes(blocks, "task-1");
    assert.strictEqual(ep1.length, 1);
    assert.strictEqual(ep1[0]!.taskId, "task-1");
    assert.strictEqual(ep1[0]!.activeTaskDurationSeconds, 1800);
    assert.strictEqual(ep1[0]!.fragmentCount, 1);

    const ep2 = segmentTaskExecutionEpisodes(blocks, "task-2");
    assert.strictEqual(ep2.length, 1);
    assert.strictEqual(ep2[0]!.taskId, "task-2");
    assert.strictEqual(ep2[0]!.activeTaskDurationSeconds, 1800);
    assert.strictEqual(ep2[0]!.fragmentCount, 1);
  });

  test("continuation threshold splits into multiple bounded episodes", () => {
    // Morning session: 09:00 - 10:00
    // Long gap: 10:00 - 13:00 (3 hours = 10800s > continuationGapThreshold 7200s)
    // Afternoon session: 13:00 - 14:00
    const blocks = [
      taskBlock("b1", "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z", 3600, "task-1"),
      breakBlock("b2", "2026-09-01T10:00:00Z", "2026-09-01T13:00:00Z", 10800),
      taskBlock("b3", "2026-09-01T13:00:00Z", "2026-09-01T14:00:00Z", 3600, "task-1"),
    ];

    const episodes = segmentTaskExecutionEpisodes(blocks, "task-1", {
      continuationGapThresholdSeconds: 7200,
    });

    assert.strictEqual(episodes.length, 2);
    assert.strictEqual(episodes[0]!.startedAt, "2026-09-01T09:00:00Z");
    assert.strictEqual(episodes[0]!.endedAt, "2026-09-01T10:00:00Z");
    assert.strictEqual(episodes[0]!.fragmentCount, 1);
    assert.strictEqual(episodes[0]!.wallClockFragmentationRatio, 0);

    assert.strictEqual(episodes[1]!.startedAt, "2026-09-01T13:00:00Z");
    assert.strictEqual(episodes[1]!.endedAt, "2026-09-01T14:00:00Z");
    assert.strictEqual(episodes[1]!.fragmentCount, 1);
    assert.strictEqual(episodes[1]!.wallClockFragmentationRatio, 0);
  });

  test("calendar day boundary splits episodes even if gap is within threshold", () => {
    // 23:45 Monday to 00:15 Tuesday (gap is only 30 min, but day closes)
    const blocks = [
      taskBlock("b1", "2026-09-01T23:00:00Z", "2026-09-01T23:30:00Z", 1800, "task-1"),
      breakBlock("b2", "2026-09-01T23:30:00Z", "2026-09-02T00:00:00Z", 1800),
      taskBlock("b3", "2026-09-02T00:00:00Z", "2026-09-02T00:30:00Z", 1800, "task-1"),
    ];

    const episodes = segmentTaskExecutionEpisodes(blocks, "task-1", {
      continuationGapThresholdSeconds: 7200,
      timezone: "UTC",
    });

    assert.strictEqual(episodes.length, 2);
    assert.strictEqual(episodes[0]!.startedAt, "2026-09-01T23:00:00Z");
    assert.strictEqual(episodes[0]!.endedAt, "2026-09-01T23:30:00Z");
    assert.strictEqual(episodes[1]!.startedAt, "2026-09-02T00:00:00Z");
    assert.strictEqual(episodes[1]!.endedAt, "2026-09-02T00:30:00Z");
  });

  test("unknown intervals are accounted for in unknownSeconds and unknownFraction, but not active or known gap", () => {
    // Task A: 10:00-10:30 (1800s)
    // UNKNOWN: 10:30-10:45 (900s)
    // Task A: 10:45-11:00 (900s)
    const blocks = [
      taskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", 1800, "task-1"),
      unknownBlock("b2", "2026-09-01T10:30:00Z", "2026-09-01T10:45:00Z", 900),
      taskBlock("b3", "2026-09-01T10:45:00Z", "2026-09-01T11:00:00Z", 900, "task-1"),
    ];

    const episodes = segmentTaskExecutionEpisodes(blocks, "task-1");
    assert.strictEqual(episodes.length, 1);

    const ep = episodes[0]!;
    assert.strictEqual(ep.fragmentCount, 2);
    assert.strictEqual(ep.wallClockSpanSeconds, 3600);
    assert.strictEqual(ep.activeTaskDurationSeconds, 2700);
    assert.strictEqual(ep.knownInterveningGapSeconds, 0);
    assert.strictEqual(ep.unknownSeconds, 900);
    assert.strictEqual(ep.unknownFraction, 900 / 3600); // 0.25
    assert.strictEqual(ep.wallClockFragmentationRatio, 0); // known gaps / span = 0 / 3600 = 0

    // Invariant
    assert.strictEqual(
      ep.wallClockSpanSeconds,
      ep.activeTaskDurationSeconds + ep.knownInterveningGapSeconds + ep.unknownSeconds
    );
  });

  test("input shuffling produces identical deterministic episode output", () => {
    const b1 = taskBlock("b1", "2026-09-01T10:00:00Z", "2026-09-01T10:20:00Z", 1200, "task-1");
    const b2 = breakBlock("b2", "2026-09-01T10:20:00Z", "2026-09-01T10:30:00Z", 600);
    const b3 = taskBlock("b3", "2026-09-01T10:30:00Z", "2026-09-01T10:50:00Z", 1200, "task-1");

    const original = [b1, b2, b3];
    const shuffled = [b3, b1, b2];

    const res1 = segmentTaskExecutionEpisodes(original, "task-1");
    const res2 = segmentTaskExecutionEpisodes(shuffled, "task-1");

    assert.deepStrictEqual(res1, res2);
  });

  test("empty blocks returns empty episodes safely", () => {
    const episodes = segmentTaskExecutionEpisodes([], "task-1");
    assert.deepStrictEqual(episodes, []);
  });
});
