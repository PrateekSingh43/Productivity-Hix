import { strict as assert } from "node:assert";
import { test } from "node:test";
import { extractCheckInFeatures } from "./check-in";
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
  reasons: ["deep_focus", "good_flow"],
  state: "focused",
  energy: "high",
  focus: "focused",
  note: "Solid progress on backend",
  questionVersion: "v1",
  source: "extension",
  intent: "Focus block",
  progress: true,
  blocker: "None",
  productive: true,
  outcome: "Completed auth route",
  createdAt: "2026-01-01T11:00:00.000Z",
  ...overrides,
});

const mockEvent = (
  timestamp: string,
  durationSec: number,
): NormalizedActivityEvent => ({
  externalId: `ev-${timestamp}`,
  bucketId: "b1",
  source: "desktop",
  watcher: "window",
  timestamp,
  duration: durationSec,
  data: { app: "Code" },
});

test("check-in features: complete check-in with valid observed telemetry window", () => {
  const checkIn = mockCheckIn();
  // 1800s active within 10:00 - 11:00
  const events = [mockEvent("2026-01-01T10:15:00.000Z", 1800)];

  const features = extractCheckInFeatures(checkIn, events);

  assert.equal(features.checkInId, "checkin-1");
  assert.equal(features.timestamp, "2026-01-01T11:00:00.000Z");
  assert.equal(features.windowStart, "2026-01-01T10:00:00.000Z");
  assert.equal(features.windowEnd, "2026-01-01T11:00:00.000Z");
  assert.equal(features.focus, "focused");
  assert.equal(features.energy, "high");
  assert.equal(features.state, "focused");
  assert.equal(features.productive, true);
  assert.equal(features.progress, true);
  assert.equal(features.reasonCount, 2);
  assert.equal(features.hasBlocker, true);
  assert.equal(features.hasOutcome, true);
  assert.equal(features.observedActiveSeconds, 1800);
});

test("check-in features: missing optional values handled gracefully", () => {
  const checkIn = mockCheckIn({
    windowStart: null,
    windowEnd: null,
    focus: null,
    energy: null,
    state: null,
    reasons: [],
    blocker: null,
    outcome: null,
    note: null,
  });

  const features = extractCheckInFeatures(checkIn);

  assert.equal(features.focus, null);
  assert.equal(features.energy, null);
  assert.equal(features.state, null);
  assert.equal(features.reasonCount, 0);
  assert.equal(features.hasBlocker, false);
  assert.equal(features.hasOutcome, false);
  assert.equal(features.observedActiveSeconds, null, "No events provided -> null");
});

test("check-in features: insufficient evidence produces null observedActiveSeconds", () => {
  // Missing both window boundaries
  const checkIn = mockCheckIn({
    windowStart: null,
    windowEnd: null,
    createdAt: "2026-01-01T11:00:00.000Z",
  });
  const events = [mockEvent("2026-01-01T10:30:00.000Z", 600)];

  const features = extractCheckInFeatures(checkIn, events);
  assert.equal(
    features.observedActiveSeconds,
    null,
    "When window is unreliable, observedActiveSeconds must be null (not 0)",
  );
});

test("check-in features: valid window with zero activity produces 0 observedActiveSeconds", () => {
  const checkIn = mockCheckIn({
    windowStart: "2026-01-01T10:00:00.000Z",
    windowEnd: "2026-01-01T11:00:00.000Z",
  });
  // Telemetry is outside the window (08:00)
  const events = [mockEvent("2026-01-01T08:00:00.000Z", 600)];

  const features = extractCheckInFeatures(checkIn, events);
  assert.equal(
    features.observedActiveSeconds,
    0,
    "Valid window with no active telemetry must produce 0 (distinct from null)",
  );
});
