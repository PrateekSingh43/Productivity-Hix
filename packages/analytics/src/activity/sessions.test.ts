import { strict as assert } from "node:assert";
import { test } from "node:test";
import { deriveSessions } from "./sessions";
import type { NormalizedActivityEvent } from "@repo/types";

const mockEvent = (
  externalId: string,
  timestamp: string,
  durationSec: number,
  watcher: NormalizedActivityEvent["watcher"] = "window",
  source: NormalizedActivityEvent["source"] = "desktop",
  data: Record<string, unknown> = {},
): NormalizedActivityEvent => ({
  externalId,
  bucketId: "test-bucket",
  source,
  watcher,
  timestamp,
  duration: durationSec,
  data,
});

// 1. One active event
test("deriveSessions: 1. one active event produces one session with matching start, end, and duration", () => {
  const events = [mockEvent("ev-1", "2026-01-01T10:00:00.000Z", 600)];
  const sessions = deriveSessions(events, 300);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.id, "derived-1");
  assert.equal(sessions[0]!.startedAt, "2026-01-01T10:00:00.000Z");
  assert.equal(sessions[0]!.endedAt, "2026-01-01T10:10:00.000Z");
  assert.equal(sessions[0]!.durationSeconds, 600);
  assert.equal(sessions[0]!.taskId, null);
  assert.equal(sessions[0]!.source, "derived");
});

// 2. Two events inside one session
test("deriveSessions: 2. two contiguous/nearby events merge into one continuous session", () => {
  const events = [
    mockEvent("ev-1", "2026-01-01T10:00:00.000Z", 600), // 10:00 - 10:10
    mockEvent("ev-2", "2026-01-01T10:12:00.000Z", 600), // 10:12 - 10:22 (gap 2m <= 5m)
  ];
  const sessions = deriveSessions(events, 300);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.startedAt, "2026-01-01T10:00:00.000Z");
  assert.equal(sessions[0]!.endedAt, "2026-01-01T10:22:00.000Z");
  assert.equal(sessions[0]!.durationSeconds, 1320); // 22 minutes = 1320s
});

// 3. Two sessions separated by > 5 minutes
test("deriveSessions: 3. two sessions separated by > 5 minutes (gapSeconds = 300)", () => {
  const events = [
    mockEvent("ev-1", "2026-01-01T10:00:00.000Z", 600), // 10:00 - 10:10
    mockEvent("ev-2", "2026-01-01T10:16:00.000Z", 600), // 10:16 - 10:26 (gap 6m > 5m)
  ];
  const sessions = deriveSessions(events, 300);

  assert.equal(sessions.length, 2);
  assert.equal(sessions[0]!.startedAt, "2026-01-01T10:00:00.000Z");
  assert.equal(sessions[0]!.endedAt, "2026-01-01T10:10:00.000Z");
  assert.equal(sessions[0]!.durationSeconds, 600);

  assert.equal(sessions[1]!.startedAt, "2026-01-01T10:16:00.000Z");
  assert.equal(sessions[1]!.endedAt, "2026-01-01T10:26:00.000Z");
  assert.equal(sessions[1]!.durationSeconds, 600);
});

// 4. Event exactly at the 5-minute boundary
test("deriveSessions: 4. event exactly at 5-minute gap boundary merges into session", () => {
  const events = [
    mockEvent("ev-1", "2026-01-01T10:00:00.000Z", 600), // 10:00 - 10:10
    mockEvent("ev-2", "2026-01-01T10:15:00.000Z", 600), // 10:15 - 10:25 (gap exactly 5m = 300s)
  ];
  const sessions = deriveSessions(events, 300);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.startedAt, "2026-01-01T10:00:00.000Z");
  assert.equal(sessions[0]!.endedAt, "2026-01-01T10:25:00.000Z");
  assert.equal(sessions[0]!.durationSeconds, 1500); // 25 min = 1500s
});

// 5. Overlapping events
test("deriveSessions: 5. overlapping events do not double count elapsed time", () => {
  const events = [
    mockEvent("ev-1", "2026-01-01T10:00:00.000Z", 600), // 10:00 - 10:10
    mockEvent("ev-2", "2026-01-01T10:05:00.000Z", 600), // 10:05 - 10:15 (5m overlap)
  ];
  const sessions = deriveSessions(events, 300);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.startedAt, "2026-01-01T10:00:00.000Z");
  assert.equal(sessions[0]!.endedAt, "2026-01-01T10:15:00.000Z");
  assert.equal(sessions[0]!.durationSeconds, 900); // 15 min = 900s, NOT 1200s
});

// 6. Out-of-order input
test("deriveSessions: 6. out-of-order input produces identical deterministic session output", () => {
  const eventsInOrder = [
    mockEvent("ev-1", "2026-01-01T10:00:00.000Z", 600),
    mockEvent("ev-2", "2026-01-01T10:05:00.000Z", 600),
    mockEvent("ev-3", "2026-01-01T10:30:00.000Z", 600),
  ];
  const eventsOutOfOrder = [eventsInOrder[2]!, eventsInOrder[0]!, eventsInOrder[1]!];

  const sessions1 = deriveSessions(eventsInOrder, 300);
  const sessions2 = deriveSessions(eventsOutOfOrder, 300);

  assert.deepEqual(sessions1, sessions2);
  assert.equal(sessions1.length, 2);
  assert.equal(sessions1[0]!.durationSeconds, 900);
  assert.equal(sessions1[1]!.durationSeconds, 600);
});

// 7. Duplicate timestamps
test("deriveSessions: 7. duplicate timestamps are deterministically sorted and merged", () => {
  const events = [
    mockEvent("b-short", "2026-01-01T10:00:00.000Z", 300),
    mockEvent("a-long", "2026-01-01T10:00:00.000Z", 900),
  ];
  const sessions = deriveSessions(events, 300);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.startedAt, "2026-01-01T10:00:00.000Z");
  assert.equal(sessions[0]!.endedAt, "2026-01-01T10:15:00.000Z");
  assert.equal(sessions[0]!.durationSeconds, 900);
});

// 8. Zero duration
test("deriveSessions: 8. events with zero duration are ignored", () => {
  const events = [
    mockEvent("ev-zero", "2026-01-01T10:00:00.000Z", 0),
    mockEvent("ev-valid", "2026-01-01T10:05:00.000Z", 300),
  ];
  const sessions = deriveSessions(events, 300);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.startedAt, "2026-01-01T10:05:00.000Z");
  assert.equal(sessions[0]!.endedAt, "2026-01-01T10:10:00.000Z");
  assert.equal(sessions[0]!.durationSeconds, 300);
});

// 9. Negative duration
test("deriveSessions: 9. events with negative duration are ignored", () => {
  const events = [
    mockEvent("ev-neg", "2026-01-01T10:00:00.000Z", -100),
    mockEvent("ev-valid", "2026-01-01T10:10:00.000Z", 600),
  ];
  const sessions = deriveSessions(events, 300);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.startedAt, "2026-01-01T10:10:00.000Z");
  assert.equal(sessions[0]!.endedAt, "2026-01-01T10:20:00.000Z");
  assert.equal(sessions[0]!.durationSeconds, 600);
});

// 10. Invalid timestamp
test("deriveSessions: 10. events with invalid timestamp strings are ignored without throwing", () => {
  const events = [
    mockEvent("ev-bad-1", "invalid-date", 600),
    mockEvent("ev-bad-2", "", 300),
    mockEvent("ev-good", "2026-01-01T10:00:00.000Z", 600),
  ];
  const sessions = deriveSessions(events, 300);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.startedAt, "2026-01-01T10:00:00.000Z");
  assert.equal(sessions[0]!.endedAt, "2026-01-01T10:10:00.000Z");
  assert.equal(sessions[0]!.durationSeconds, 600);
});

// 11. Idle/AFK event excluded
test("deriveSessions: 11. idle and AFK events are excluded from active sessions", () => {
  const events = [
    mockEvent("ev-1", "2026-01-01T10:00:00.000Z", 600, "window"),
    mockEvent("ev-afk", "2026-01-01T10:10:00.000Z", 900, "afk"),
    mockEvent("ev-idle-term", "2026-01-01T10:25:00.000Z", 600, "window", "desktop", { status: "afk" }),
    mockEvent("ev-2", "2026-01-01T10:50:00.000Z", 600, "window"),
  ];
  const sessions = deriveSessions(events, 300);

  assert.equal(sessions.length, 2);
  assert.equal(sessions[0]!.startedAt, "2026-01-01T10:00:00.000Z");
  assert.equal(sessions[0]!.endedAt, "2026-01-01T10:10:00.000Z");
  assert.equal(sessions[0]!.durationSeconds, 600);

  assert.equal(sessions[1]!.startedAt, "2026-01-01T10:50:00.000Z");
  assert.equal(sessions[1]!.endedAt, "2026-01-01T11:00:00.000Z");
  assert.equal(sessions[1]!.durationSeconds, 600);
});

// 12. Multiple overlapping events from browser and desktop
test("deriveSessions: 12. multiple overlapping events from browser and desktop produce one wall-clock coverage session", () => {
  // Browser: 10:00 - 10:30 (1800s)
  // Desktop: 10:00 - 10:30 (1800s)
  // Browser tab 2: 10:15 - 10:45 (1800s)
  // Total span: 10:00 - 10:45 = 45 min = 2700s
  const events = [
    mockEvent("ev-b1", "2026-01-01T10:00:00.000Z", 1800, "web", "browser"),
    mockEvent("ev-d1", "2026-01-01T10:00:00.000Z", 1800, "window", "desktop"),
    mockEvent("ev-b2", "2026-01-01T10:15:00.000Z", 1800, "web", "browser"),
  ];
  const sessions = deriveSessions(events, 300);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.startedAt, "2026-01-01T10:00:00.000Z");
  assert.equal(sessions[0]!.endedAt, "2026-01-01T10:45:00.000Z");
  assert.equal(sessions[0]!.durationSeconds, 2700); // 45 min = 2700s, NOT 5400s
});

test("deriveSessions: does not mutate the caller's input array", () => {
  const events = [
    mockEvent("ev-2", "2026-01-01T10:30:00.000Z", 600),
    mockEvent("ev-1", "2026-01-01T10:00:00.000Z", 600),
  ];
  const originalFirstId = events[0]!.externalId;
  deriveSessions(events, 300);
  assert.equal(events[0]!.externalId, originalFirstId, "Input array must not be mutated in-place");
});

// 13. Non-finite durations (Infinity, -Infinity) are ignored
test("deriveSessions: 13. events with non-finite durations (Infinity, -Infinity) are ignored", () => {
  const events = [
    mockEvent("ev-inf", "2026-01-01T10:00:00.000Z", Infinity),
    mockEvent("ev-neginf", "2026-01-01T10:05:00.000Z", -Infinity),
    mockEvent("ev-valid", "2026-01-01T10:10:00.000Z", 600),
  ];
  const sessions = deriveSessions(events, 300);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.startedAt, "2026-01-01T10:10:00.000Z");
  assert.equal(sessions[0]!.endedAt, "2026-01-01T10:20:00.000Z");
  assert.equal(sessions[0]!.durationSeconds, 600);
});

