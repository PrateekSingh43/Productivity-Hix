import { strict as assert } from "node:assert";
import { test } from "node:test";
import { findDiscrepancies } from "./discrepancies";
import type { CheckIn, NormalizedActivityEvent } from "@repo/types";

const mockCheckIn = (overrides: Partial<CheckIn> = {}): CheckIn => ({
  id: "checkin-1",
  userId: "user-1",
  workSessionId: null,
  taskId: null,
  windowStart: "2026-01-01T10:00:00.000Z",
  windowEnd: "2026-01-01T11:00:00.000Z",
  activityAssessment: "productive",
  alignment: "yes",
  reasons: [],
  state: null,
  energy: null,
  focus: null,
  note: null,
  questionVersion: "v1",
  source: "test",
  intent: null,
  progress: true,
  blocker: null,
  productive: true,
  outcome: null,
  createdAt: "2026-01-01T11:00:00.000Z",
  ...overrides,
});

const mockEvent = (
  timestamp: string,
  durationSec: number,
  watcher: NormalizedActivityEvent["watcher"] = "window",
  source: NormalizedActivityEvent["source"] = "desktop",
  data: Record<string, unknown> = {},
): NormalizedActivityEvent => ({
  externalId: `ev-${timestamp}-${durationSec}-${source}`,
  bucketId: "test-bucket",
  source,
  watcher,
  timestamp,
  duration: durationSec,
  data,
});

// 1. One check-in with matching telemetry
test("discrepancies: 1. one check-in with matching telemetry within window", () => {
  const checkIn = mockCheckIn({
    windowStart: "2026-01-01T10:00:00.000Z",
    windowEnd: "2026-01-01T11:00:00.000Z",
    progress: true,
  });
  // 1500 seconds of active telemetry in a 3600-second window
  const events = [mockEvent("2026-01-01T10:10:00.000Z", 1500)];
  const res = findDiscrepancies([checkIn], events);

  assert.equal(res.length, 1);
  assert.equal(res[0]!.observedActiveSeconds, 1500);
  assert.equal(res[0]!.note, "aligned");
});

// 2. Two check-ins with separate non-overlapping windows
test("discrepancies: 2. two check-ins with separate non-overlapping windows", () => {
  const checkIn1 = mockCheckIn({
    id: "c1",
    windowStart: "2026-01-01T10:00:00.000Z",
    windowEnd: "2026-01-01T11:00:00.000Z",
    progress: true,
  });
  const checkIn2 = mockCheckIn({
    id: "c2",
    windowStart: "2026-01-01T14:00:00.000Z",
    windowEnd: "2026-01-01T15:00:00.000Z",
    progress: false,
  });

  const events = [
    // 600 seconds in window 1
    mockEvent("2026-01-01T10:15:00.000Z", 600),
    // 2400 seconds (40 min) in window 2
    mockEvent("2026-01-01T14:10:00.000Z", 2400),
  ];

  const res = findDiscrepancies([checkIn1, checkIn2], events);
  assert.equal(res.length, 2);

  assert.equal(res[0]!.checkInId, "c1");
  assert.equal(res[0]!.observedActiveSeconds, 600);
  assert.equal(res[0]!.note, "aligned");

  assert.equal(res[1]!.checkInId, "c2");
  assert.equal(res[1]!.observedActiveSeconds, 2400);
  assert.equal(res[1]!.note, "observed-time-without-progress");
});

// 3. Telemetry outside a check-in window
test("discrepancies: 3. telemetry outside check-in window is ignored", () => {
  const checkIn = mockCheckIn({
    windowStart: "2026-01-01T10:00:00.000Z",
    windowEnd: "2026-01-01T11:00:00.000Z",
    progress: true,
  });
  // Telemetry is earlier (08:00) and later (12:00)
  const events = [
    mockEvent("2026-01-01T08:00:00.000Z", 1800),
    mockEvent("2026-01-01T12:00:00.000Z", 1800),
  ];
  const res = findDiscrepancies([checkIn], events);

  assert.equal(res[0]!.observedActiveSeconds, 0);
  assert.equal(res[0]!.note, "reported-progress-without-observed-time");
});

// 4. Overlapping browser/desktop telemetry
test("discrepancies: 4. overlapping browser/desktop telemetry does not double-count", () => {
  const checkIn = mockCheckIn({
    windowStart: "2026-01-01T10:00:00.000Z",
    windowEnd: "2026-01-01T11:00:00.000Z",
    progress: true,
  });
  // Browser: 10:00 - 10:30 (1800s)
  // Desktop: 10:10 - 10:40 (1800s)
  // Union: 10:00 - 10:40 = 40 minutes = 2400s
  const events = [
    mockEvent("2026-01-01T10:00:00.000Z", 1800, "web", "browser"),
    mockEvent("2026-01-01T10:10:00.000Z", 1800, "window", "desktop"),
  ];
  const res = findDiscrepancies([checkIn], events);

  assert.equal(res[0]!.observedActiveSeconds, 2400);
  assert.equal(res[0]!.note, "aligned");
});

// 5. Event exactly at window end
test("discrepancies: 5. event beginning exactly at window end is outside [start, end)", () => {
  const checkIn = mockCheckIn({
    windowStart: "2026-01-01T10:00:00.000Z",
    windowEnd: "2026-01-01T11:00:00.000Z",
    progress: true,
  });
  // Starts exactly at 11:00:00.000Z
  const events = [mockEvent("2026-01-01T11:00:00.000Z", 600)];
  const res = findDiscrepancies([checkIn], events);

  assert.equal(res[0]!.observedActiveSeconds, 0);
  assert.equal(res[0]!.note, "reported-progress-without-observed-time");
});

// 6. Event ending exactly at window start
test("discrepancies: 6. event ending exactly at window start is outside [start, end)", () => {
  const checkIn = mockCheckIn({
    windowStart: "2026-01-01T10:00:00.000Z",
    windowEnd: "2026-01-01T11:00:00.000Z",
    progress: true,
  });
  // Starts at 09:50:00, duration 600s (ends at exactly 10:00:00)
  const events = [mockEvent("2026-01-01T09:50:00.000Z", 600)];
  const res = findDiscrepancies([checkIn], events);

  assert.equal(res[0]!.observedActiveSeconds, 0);
  assert.equal(res[0]!.note, "reported-progress-without-observed-time");
});

// 7. Missing windowStart
test("discrepancies: 7. missing windowStart marks observation as insufficient-evidence", () => {
  const checkIn = mockCheckIn({
    windowStart: null,
    windowEnd: "2026-01-01T11:00:00.000Z",
    progress: true,
  });
  const events = [mockEvent("2026-01-01T10:30:00.000Z", 600)];
  const res = findDiscrepancies([checkIn], events);

  assert.equal(res[0]!.observedActiveSeconds, 0);
  assert.equal(res[0]!.note, "insufficient-evidence");
});

// 8. Missing windowEnd
test("discrepancies: 8. missing windowEnd uses createdAt only if createdAt > windowStart, else insufficient-evidence", () => {
  // Case A: createdAt > windowStart exists
  const checkInWithCreated = mockCheckIn({
    windowStart: "2026-01-01T10:00:00.000Z",
    windowEnd: null,
    createdAt: "2026-01-01T10:45:00.000Z",
    progress: true,
  });
  const events = [mockEvent("2026-01-01T10:10:00.000Z", 600)];
  const res1 = findDiscrepancies([checkInWithCreated], events);
  assert.equal(res1[0]!.observedActiveSeconds, 600);
  assert.equal(res1[0]!.note, "aligned");

  // Case B: createdAt is missing or <= windowStart -> no reliable window
  const checkInInvalid = mockCheckIn({
    windowStart: "2026-01-01T10:00:00.000Z",
    windowEnd: null,
    createdAt: "2026-01-01T09:00:00.000Z",
    progress: true,
  });
  const res2 = findDiscrepancies([checkInInvalid], events);
  assert.equal(res2[0]!.observedActiveSeconds, 0);
  assert.equal(res2[0]!.note, "insufficient-evidence");
});

// 9. Missing both boundaries
test("discrepancies: 9. missing both window boundaries marks as insufficient-evidence", () => {
  const checkIn = mockCheckIn({
    windowStart: null,
    windowEnd: null,
    createdAt: "2026-01-01T11:00:00.000Z",
    progress: true,
  });
  const events = [mockEvent("2026-01-01T10:30:00.000Z", 600)];
  const res = findDiscrepancies([checkIn], events);

  assert.equal(res[0]!.observedActiveSeconds, 0);
  assert.equal(res[0]!.note, "insufficient-evidence");
});

// 10. Invalid timestamps
test("discrepancies: 10. invalid timestamps in check-in or events are handled safely", () => {
  const checkInBad = mockCheckIn({
    windowStart: "not-a-date",
    windowEnd: "2026-01-01T11:00:00.000Z",
  });
  const checkInGood = mockCheckIn({
    id: "good",
    windowStart: "2026-01-01T10:00:00.000Z",
    windowEnd: "2026-01-01T11:00:00.000Z",
  });

  const events = [
    mockEvent("not-a-timestamp", 600),
    mockEvent("2026-01-01T10:10:00.000Z", -50), // negative duration
    mockEvent("2026-01-01T10:20:00.000Z", 300), // valid
  ];

  const res = findDiscrepancies([checkInBad, checkInGood], events);
  assert.equal(res[0]!.note, "insufficient-evidence");
  assert.equal(res[1]!.observedActiveSeconds, 300);
  assert.equal(res[1]!.note, "aligned");
});

// 11. Idle telemetry inside the window
test("discrepancies: 11. idle telemetry inside window is excluded from observed active time", () => {
  const checkIn = mockCheckIn({
    windowStart: "2026-01-01T10:00:00.000Z",
    windowEnd: "2026-01-01T11:00:00.000Z",
    progress: true,
  });
  // 30 minutes of AFK/idle telemetry, only 30 seconds of active work
  const events = [
    mockEvent("2026-01-01T10:00:00.000Z", 1800, "afk"),
    mockEvent("2026-01-01T10:30:00.000Z", 30, "window"),
  ];
  const res = findDiscrepancies([checkIn], events);

  assert.equal(res[0]!.observedActiveSeconds, 30);
  assert.equal(res[0]!.note, "reported-progress-without-observed-time");
});

// 12. Multiple overlapping events producing one unioned active duration
test("discrepancies: 12. multiple overlapping events produce exact unioned active duration", () => {
  const checkIn = mockCheckIn({
    windowStart: "2026-01-01T10:00:00.000Z",
    windowEnd: "2026-01-01T11:00:00.000Z",
    progress: false,
  });

  // Event 1: 09:50 - 10:15 (25 min total, clips in window to 10:00 - 10:15 = 15m / 900s)
  // Event 2: 10:10 - 10:35 (25 min, overlaps Event 1; union becomes 10:00 - 10:35 = 35m / 2100s)
  // Event 3: 10:20 - 10:40 (20 min, overlaps Event 2; union becomes 10:00 - 10:40 = 40m / 2400s)
  // Event 4: 10:55 - 11:20 (25 min, clips in window to 10:55 - 11:00 = 5m / 300s)
  // Total union: (10:00 to 10:40 = 2400s) + (10:55 to 11:00 = 300s) = 2700s (45 minutes)
  const events = [
    mockEvent("2026-01-01T09:50:00.000Z", 1500),
    mockEvent("2026-01-01T10:10:00.000Z", 1500),
    mockEvent("2026-01-01T10:20:00.000Z", 1200),
    mockEvent("2026-01-01T10:55:00.000Z", 1500),
  ];

  const res = findDiscrepancies([checkIn], events);

  assert.equal(res[0]!.observedActiveSeconds, 2700);
  assert.equal(res[0]!.note, "observed-time-without-progress");
});
