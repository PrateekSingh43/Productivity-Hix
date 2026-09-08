import { strict as assert } from "node:assert";
import { test } from "node:test";
import { extractSessionFeatures } from "./session";
import type { TimelineSegment, WorkSession } from "@repo/types";

const mockSession = (
  startedAt: string,
  endedAt: string,
  durationSeconds: number,
): WorkSession => ({
  id: "derived-1",
  taskId: null,
  startedAt,
  endedAt,
  durationSeconds,
  source: "derived",
  notes: null,
});

const mockSegment = (
  start: string,
  end: string,
  durationSeconds: number,
  category: TimelineSegment["category"] = "focused",
  application = "Code",
  title = "index.ts",
): TimelineSegment => ({
  id: `seg-${start}`,
  start,
  end,
  durationMs: durationSeconds * 1000,
  durationSeconds,
  source: "desktop",
  type: "application",
  application,
  title,
  category,
});

test("session features: empty / zero session input", () => {
  const session = mockSession("2026-01-01T10:00:00.000Z", "2026-01-01T10:00:00.000Z", 0);
  const features = extractSessionFeatures(session, []);

  assert.deepEqual(features, {
    durationSeconds: 0,
    activeDurationSeconds: 0,
    contextCount: 0,
    contextSwitchCount: 0,
    contextSwitchesPerHour: 0,
    productiveDurationSeconds: 0,
    idleDurationSeconds: 0,
    distractionDurationSeconds: 0,
  });
});

test("session features: one continuous session with single context", () => {
  const session = mockSession("2026-01-01T10:00:00.000Z", "2026-01-01T10:30:00.000Z", 1800);
  const segments = [
    mockSegment("2026-01-01T10:00:00.000Z", "2026-01-01T10:30:00.000Z", 1800, "focused", "Code", "app.ts"),
  ];

  const features = extractSessionFeatures(session, segments);
  assert.equal(features.durationSeconds, 1800);
  assert.equal(features.activeDurationSeconds, 1800);
  assert.equal(features.productiveDurationSeconds, 1800);
  assert.equal(features.distractionDurationSeconds, 0);
  assert.equal(features.idleDurationSeconds, 0);
  assert.equal(features.contextCount, 1);
  assert.equal(features.contextSwitchCount, 0, "No context switches in a single continuous context");
  assert.equal(features.contextSwitchesPerHour, 0);
});

test("session features: multiple contexts and known context switches", () => {
  const session = mockSession("2026-01-01T10:00:00.000Z", "2026-01-01T11:00:00.000Z", 3600);
  // Context A (20m) -> Context B (20m) -> Context A (20m) = 2 switches
  const segments = [
    mockSegment("2026-01-01T10:00:00.000Z", "2026-01-01T10:20:00.000Z", 1200, "focused", "Code", "server.ts"),
    mockSegment("2026-01-01T10:20:00.000Z", "2026-01-01T10:40:00.000Z", 1200, "browser", "Chrome", "Docs"),
    mockSegment("2026-01-01T10:40:00.000Z", "2026-01-01T11:00:00.000Z", 1200, "focused", "Code", "server.ts"),
  ];

  const features = extractSessionFeatures(session, segments);
  assert.equal(features.durationSeconds, 3600);
  assert.equal(features.activeDurationSeconds, 3600);
  assert.equal(features.productiveDurationSeconds, 2400); // 40m focused
  assert.equal(features.distractionDurationSeconds, 0);
  assert.equal(features.contextCount, 2, "Two distinct contexts (Code: server.ts and Chrome: Docs)");
  assert.equal(features.contextSwitchCount, 2, "A -> B -> A is exactly 2 context switches");
  assert.equal(features.contextSwitchesPerHour, 2, "2 switches in 1 hour = 2.0 / hr");
});

test("session features: handles idle and distraction durations correctly", () => {
  const session = mockSession("2026-01-01T10:00:00.000Z", "2026-01-01T11:00:00.000Z", 3600);
  // Focused (30m) -> Leisure / Distraction (15m) -> Break / AFK (15m)
  const segments = [
    mockSegment("2026-01-01T10:00:00.000Z", "2026-01-01T10:30:00.000Z", 1800, "focused", "Code", "app.ts"),
    mockSegment("2026-01-01T10:30:00.000Z", "2026-01-01T10:45:00.000Z", 900, "leisure", "Chrome", "YouTube"),
    mockSegment("2026-01-01T10:45:00.000Z", "2026-01-01T11:00:00.000Z", 900, "break", "AFK", "Away"),
  ];

  const features = extractSessionFeatures(session, segments);
  assert.equal(features.durationSeconds, 3600);
  assert.equal(features.activeDurationSeconds, 2700, "Active work excludes 15m AFK break");
  assert.equal(features.productiveDurationSeconds, 1800, "30m focused");
  assert.equal(features.distractionDurationSeconds, 900, "15m leisure");
  assert.equal(features.idleDurationSeconds, 900, "15m idle elapsed duration");
});

test("session features: overlapping browser/desktop activity does not double count elapsed active time", () => {
  const session = mockSession("2026-01-01T10:00:00.000Z", "2026-01-01T10:40:00.000Z", 2400);
  // Two non-overlapping pre-clipped segments representing merged coverage of concurrent browser + desktop
  const segments = [
    mockSegment("2026-01-01T10:00:00.000Z", "2026-01-01T10:20:00.000Z", 1200, "focused", "Code", "app.ts"),
    mockSegment("2026-01-01T10:20:00.000Z", "2026-01-01T10:40:00.000Z", 1200, "browser", "Brave", "GitHub"),
  ];

  const features = extractSessionFeatures(session, segments);
  assert.equal(features.durationSeconds, 2400);
  assert.equal(features.activeDurationSeconds, 2400);
  assert.equal(features.contextCount, 2);
  assert.equal(features.contextSwitchCount, 1);
});
