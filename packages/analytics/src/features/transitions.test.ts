import { strict as assert } from "node:assert";
import { test } from "node:test";
import { extractTransitionFeatures } from "./transitions";
import type { TimelineSegment } from "@repo/types";

const mockSegment = (
  start: string,
  end: string,
  durationSeconds: number,
  category: TimelineSegment["category"],
): TimelineSegment => ({
  id: `seg-${start}`,
  start,
  end,
  durationMs: durationSeconds * 1000,
  durationSeconds,
  source: "desktop",
  type: "application",
  application: "App",
  title: "Title",
  category,
});

test("transitions: empty input produces empty transitions", () => {
  const res = extractTransitionFeatures([]);
  assert.equal(res.totalTransitions, 0);
  assert.equal(res.productiveTransitions, 0);
  assert.equal(res.distractionTransitions, 0);
  assert.deepEqual(res.transitions, []);
});

test("transitions: same-category consecutive events do not trigger transitions", () => {
  const segments = [
    mockSegment("2026-01-01T10:00:00.000Z", "2026-01-01T10:15:00.000Z", 900, "focused"),
    mockSegment("2026-01-01T10:15:00.000Z", "2026-01-01T10:30:00.000Z", 900, "focused"),
  ];

  const res = extractTransitionFeatures(segments);
  assert.equal(res.totalTransitions, 0);
  assert.deepEqual(res.transitions, []);
});

test("transitions: A -> B transition", () => {
  const segments = [
    mockSegment("2026-01-01T10:00:00.000Z", "2026-01-01T10:20:00.000Z", 1200, "focused"),
    mockSegment("2026-01-01T10:20:00.000Z", "2026-01-01T10:30:00.000Z", 600, "leisure"),
  ];

  const res = extractTransitionFeatures(segments);
  assert.equal(res.totalTransitions, 1);
  assert.equal(res.productiveTransitions, 0);
  assert.equal(res.distractionTransitions, 1, "Transition into leisure counts as distraction transition");

  assert.equal(res.transitions.length, 1);
  assert.equal(res.transitions[0]!.fromCategory, "focused");
  assert.equal(res.transitions[0]!.toCategory, "leisure");
  assert.equal(res.transitions[0]!.count, 1);
  assert.equal(res.transitions[0]!.durationBeforeTransition, 1200);
  assert.equal(res.transitions[0]!.durationAfterTransition, 600);
});

test("transitions: A -> B -> A transitions", () => {
  const segments = [
    mockSegment("2026-01-01T10:00:00.000Z", "2026-01-01T10:20:00.000Z", 1200, "focused"),
    mockSegment("2026-01-01T10:20:00.000Z", "2026-01-01T10:35:00.000Z", 900, "browser"),
    mockSegment("2026-01-01T10:35:00.000Z", "2026-01-01T11:00:00.000Z", 1500, "focused"),
  ];

  const res = extractTransitionFeatures(segments);
  assert.equal(res.totalTransitions, 2);
  assert.equal(res.productiveTransitions, 1, "Transition back to focused is a productive transition");
  assert.equal(res.distractionTransitions, 0);

  assert.equal(res.transitions.length, 2);
  const t1 = res.transitions.find((t) => t.fromCategory === "focused" && t.toCategory === "browser");
  assert.ok(t1);
  assert.equal(t1.count, 1);

  const t2 = res.transitions.find((t) => t.fromCategory === "browser" && t.toCategory === "focused");
  assert.ok(t2);
  assert.equal(t2.count, 1);
});

test("transitions: overlapping intervals normalized through segment aggregation", () => {
  // Two non-overlapping sequential segments clipped from overlapping events
  const segments = [
    mockSegment("2026-01-01T10:00:00.000Z", "2026-01-01T10:15:00.000Z", 900, "focused"),
    mockSegment("2026-01-01T10:15:00.000Z", "2026-01-01T10:30:00.000Z", 900, "communication"),
  ];

  const res = extractTransitionFeatures(segments);
  assert.equal(res.totalTransitions, 1);
  assert.equal(res.transitions[0]!.fromCategory, "focused");
  assert.equal(res.transitions[0]!.toCategory, "communication");
});
