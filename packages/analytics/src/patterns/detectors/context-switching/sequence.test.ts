import { test, describe } from "node:test";
import assert from "node:assert";
import { parseContextSequence, getCanonicalContextKey } from "./sequence";
import type { TemporalEvidenceBlock } from "@repo/types";

describe("Detector 1: sequence.ts", () => {
  const baseBlock = (): TemporalEvidenceBlock => ({
    id: "block-1",
    startTime: "2023-01-01T00:00:00Z",
    endTime: "2023-01-01T00:00:00Z",
    durationSeconds: 60,
    coverage: "OBSERVED",
    provenance: [],
    observation: null,
    report: null,
    intention: null,
    outcome: null,
  });

  const appBlock = (app: string, durationSeconds: number, category: any = "work"): TemporalEvidenceBlock => ({
    ...baseBlock(),
    durationSeconds,
    observation: {
      application: app,
      title: "Title",
      cleanTitle: "Title",
      domain: null,
      category,
      isAfk: false,
      rawEventCount: 1,
    }
  });

  const browserBlock = (app: string, domain: string, durationSeconds: number): TemporalEvidenceBlock => ({
    ...baseBlock(),
    durationSeconds,
    observation: {
      application: app,
      title: "Title",
      cleanTitle: "Title",
      domain,
      category: "browser",
      isAfk: false,
      rawEventCount: 1,
    }
  });

  test("getCanonicalContextKey: browser observation", () => {
    assert.strictEqual(getCanonicalContextKey(browserBlock("Chrome", "github.com", 60)), "browser:github.com");
    assert.strictEqual(getCanonicalContextKey(browserBlock("Firefox", "github.com", 60)), "browser:github.com");
  });

  test("getCanonicalContextKey: non-browser application", () => {
    assert.strictEqual(getCanonicalContextKey(appBlock("Code.exe", 60)), "app:Code.exe");
  });

  test("getCanonicalContextKey: missing context", () => {
    const block = appBlock("", 60);
    block.observation!.application = "";
    assert.strictEqual(getCanonicalContextKey(block), null);
    
    block.observation = null;
    assert.strictEqual(getCanonicalContextKey(block), null);
  });

  test("parseContextSequence: Code -> Code generates 0 switches", () => {
    const blocks = [
      appBlock("Code.exe", 600),
      appBlock("Code.exe", 300)
    ];
    const res = parseContextSequence(blocks);
    assert.strictEqual(res.switchCount, 0);
    assert.deepStrictEqual(res.dwellDurations, [900]);
    assert.strictEqual(res.qualifyingObservedActiveDurationSeconds, 900);
  });

  test("parseContextSequence: Code -> Chrome generates 1 switch and includes terminal dwell", () => {
    const blocks = [
      appBlock("Code.exe", 600),
      browserBlock("Chrome", "github.com", 120),
      appBlock("Code.exe", 900)
    ];
    const res = parseContextSequence(blocks);
    assert.strictEqual(res.switchCount, 2);
    assert.deepStrictEqual(res.dwellDurations, [600, 120, 900]);
    assert.strictEqual(res.qualifyingObservedActiveDurationSeconds, 1620);
  });

  test("parseContextSequence: UNKNOWN boundary does not create synthetic switch", () => {
    const unknownBlock = baseBlock();
    unknownBlock.coverage = "UNKNOWN";
    unknownBlock.durationSeconds = 600;

    const blocks = [
      appBlock("Code.exe", 600),
      unknownBlock,
      browserBlock("Chrome", "github.com", 120)
    ];
    const res = parseContextSequence(blocks);
    
    // Code (600) -> [interrupt] -> Chrome (120)
    // No switch is counted across the gap
    assert.strictEqual(res.switchCount, 0);
    assert.deepStrictEqual(res.dwellDurations, [600, 120]);
    assert.strictEqual(res.qualifyingObservedActiveDurationSeconds, 720); // unknown not included in qualifying active time
  });

  test("parseContextSequence: missing context boundary does not create synthetic switch", () => {
    const missingBlock = appBlock("", 30);
    missingBlock.observation = null;

    const blocks = [
      appBlock("Code.exe", 600),
      missingBlock,
      browserBlock("Chrome", "github.com", 120)
    ];
    const res = parseContextSequence(blocks);
    
    // Code (600) -> [interrupt] -> Chrome (120)
    assert.strictEqual(res.switchCount, 0);
    assert.deepStrictEqual(res.dwellDurations, [600, 120]);
  });

  test("parseContextSequence: deterministic ordering regardless of array order", () => {
    const block1 = appBlock("Code.exe", 600);
    block1.id = "b1";
    block1.startTime = "2023-01-01T10:00:00Z";
    block1.endTime = "2023-01-01T10:10:00Z";

    const block2 = browserBlock("Chrome", "github.com", 1800);
    block2.id = "b2";
    block2.startTime = "2023-01-01T10:30:00Z";
    block2.endTime = "2023-01-01T11:00:00Z";

    const block3 = appBlock("Code.exe", 600);
    block3.id = "b3";
    block3.startTime = "2023-01-01T11:00:00Z";
    block3.endTime = "2023-01-01T11:10:00Z";

    // Expected sequence: Code -> Chrome -> Code (2 switches)
    const originalBlocks = [block1, block2, block3];
    const shuffledBlocks = [block3, block1, block2]; // B, A, C order logically B3, B1, B2

    const res1 = parseContextSequence(originalBlocks);
    const res2 = parseContextSequence(shuffledBlocks);

    assert.strictEqual(res1.switchCount, 2);
    assert.deepStrictEqual(res1, res2);
  });
});
