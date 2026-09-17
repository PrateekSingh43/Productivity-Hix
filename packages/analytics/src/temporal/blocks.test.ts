import { test } from "node:test";
import assert from "node:assert/strict";
import {
  materializeTemporalBlocks,
  type BlockEngineInput,
} from "./blocks.js";

const MS_MIN = 60_000;

function input(
  partial: Partial<BlockEngineInput> & Pick<BlockEngineInput, "activityId" | "start" | "end">
): BlockEngineInput {
  return {
    userId: "user-1",
    deviceId: null,
    source: "desktop",
    watcher: "active_window",
    application: "Code.exe",
    title: "timeline.ts - ProductiveHix",
    domain: null,
    url: null,
    isAfk: false,
    data: {},
    ...partial,
  };
}

test("single continuous event produces one block with conserved durations", () => {
  const blocks = materializeTemporalBlocks([
    input({ activityId: "a1", start: 0, end: 18 * MS_MIN }),
  ]);

  assert.equal(blocks.length, 1);
  const b = blocks[0]!;
  assert.equal(b.wallClockDurationMs, 18 * MS_MIN);
  assert.equal(b.observedActiveDurationMs, 18 * MS_MIN);
  assert.equal(b.pausedDurationMs, 0);
  assert.equal(b.observations.length, 1);
  assert.equal(b.observations[0]!.contributionDurationMs, 18 * MS_MIN);
});

test("AFK >= minBreakMs carves the block: wall clock conserved across split", () => {
  const blocks = materializeTemporalBlocks([
    input({ activityId: "a1", start: 0, end: 60 * MS_MIN, isAfk: false }),
    input({ activityId: "a2", start: 10 * MS_MIN, end: 28 * MS_MIN, isAfk: true, watcher: "afk", application: "afk" }),
  ]);
  const work = blocks.filter((b) => !b.isAfkBlock);
  const afk = blocks.filter((b) => b.isAfkBlock);
  assert.equal(work.length, 2, "AFK splits surrounding work");
  assert.equal(afk.length, 1, "AFK period becomes its own idle_away block");
  const totalWall = blocks.reduce((s, b) => s + b.wallClockDurationMs, 0);
  assert.equal(totalWall, 60 * MS_MIN, "wall clock conserved across AFK carve");
});

test("contributions stay inside block bounds and observations sum to observedActive", () => {
  const blocks = materializeTemporalBlocks([
    input({ activityId: "a1", start: 0, end: 10 * MS_MIN }),
    input({ activityId: "a2", start: 9 * MS_MIN, end: 25 * MS_MIN }),
  ]);
  assert.ok(blocks.length >= 1);
  for (const b of blocks) {
    assert.equal(b.wallClockDurationMs, b.endTime - b.startTime);
    assert.equal(b.observedActiveDurationMs + b.pausedDurationMs, b.wallClockDurationMs);
    let activeSum = 0;
    for (const o of b.observations) {
      assert.ok(o.contributionStart >= b.startTime, "contribution starts within block");
      assert.ok(o.contributionEnd <= b.endTime, "contribution ends within block");
      assert.equal(o.contributionDurationMs, o.contributionEnd - o.contributionStart);
      activeSum += o.contributionDurationMs;
    }
    assert.equal(activeSum, b.observedActiveDurationMs);
  }
});

test("materialization is idempotent: same input -> same fingerprints and blocks", () => {
  const events = [
    input({ activityId: "a1", start: 0, end: 10 * MS_MIN }),
    input({ activityId: "a2", start: 12 * MS_MIN, end: 22 * MS_MIN, application: "Code.exe", title: "same app" }),
  ];
  const first = materializeTemporalBlocks(events);
  const second = materializeTemporalBlocks(events);
  assert.deepEqual(first.map((b) => b.observationSetFingerprint), second.map((b) => b.observationSetFingerprint));
  assert.deepEqual(first.map((b) => [b.startTime, b.endTime]), second.map((b) => [b.startTime, b.endTime]));
});

test("blocks never overlap on the foreground track", () => {
  const blocks = materializeTemporalBlocks([
    input({ activityId: "a1", start: 0, end: 10 * MS_MIN }),
    input({ activityId: "a2", start: 8 * MS_MIN, end: 20 * MS_MIN }),
    input({ activityId: "a3", start: 30 * MS_MIN, end: 40 * MS_MIN, application: "Chrome" }),
  ]);
  const sorted = [...blocks].sort((a, b) => a.startTime - b.startTime);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i]!.startTime >= sorted[i - 1]!.endTime, "no overlap between consecutive blocks");
  }
});

test("same application across a short gap bridges into one block", () => {
  const blocks = materializeTemporalBlocks([
    input({ activityId: "a1", start: 0, end: 10 * MS_MIN }),
    input({ activityId: "a2", start: 11 * MS_MIN, end: 20 * MS_MIN }),
  ]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!.rawEventCount, 2);
  assert.equal(blocks[0]!.pausedDurationMs, 1 * MS_MIN);
});

test("browser events group by domain, not just application", () => {
  const blocks = materializeTemporalBlocks([
    input({ activityId: "b1", source: "browser", application: "Chrome", domain: "youtube.com", start: 0, end: 5 * MS_MIN }),
    input({ activityId: "b2", source: "browser", application: "Chrome", domain: "github.com", start: 1 * MS_MIN, end: 4 * MS_MIN }),
  ]);
  assert.equal(blocks.length, 2, "different domains stay separate");
});
