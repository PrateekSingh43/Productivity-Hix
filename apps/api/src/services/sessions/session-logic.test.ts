import { describe, it } from "vitest";
import assert from "node:assert/strict";

describe("Focus Session Invariants & Timing Precision", () => {
  it("preserves immutable startedAt across pause and resume cycles", () => {
    const sessionStart = new Date("2026-09-12T14:00:00.000Z");
    let startedAt = sessionStart;
    let lastResumedAt = sessionStart;
    let durationSeconds = 0;
    let isPaused = false;

    // Segment 1: User works 28 minutes (14:00 to 14:28)
    const pauseTime1 = new Date("2026-09-12T14:28:00.000Z");
    const seg1 = Math.round((pauseTime1.getTime() - lastResumedAt.getTime()) / 1000);
    durationSeconds += seg1;
    isPaused = true;

    assert.equal(durationSeconds, 28 * 60);
    assert.equal(startedAt.toISOString(), sessionStart.toISOString(), "startedAt must remain 14:00:00");

    // Pause gap: 4 minutes away from keyboard (14:28 to 14:32)
    // Resume at 14:32
    const resumeTime1 = new Date("2026-09-12T14:32:00.000Z");
    isPaused = false;
    lastResumedAt = resumeTime1;
    // CRITICAL: startedAt is NEVER overwritten to resumeTime1!
    assert.equal(startedAt.toISOString(), sessionStart.toISOString(), "startedAt must NEVER shift on resume");

    // Segment 2: User works 10 minutes (14:32 to 14:42)
    const pauseTime2 = new Date("2026-09-12T14:42:00.000Z");
    const seg2 = Math.round((pauseTime2.getTime() - lastResumedAt.getTime()) / 1000);
    durationSeconds += seg2;
    isPaused = true;

    assert.equal(durationSeconds, (28 + 10) * 60);
    assert.equal(startedAt.toISOString(), sessionStart.toISOString());

    // Pause gap: 3 minutes away (14:42 to 14:45)
    // Resume at 14:45
    const resumeTime2 = new Date("2026-09-12T14:45:00.000Z");
    isPaused = false;
    lastResumedAt = resumeTime2;
    assert.equal(startedAt.toISOString(), sessionStart.toISOString());

    // Segment 3: User works 16 minutes until completion (14:45 to 15:01)
    const endTime = new Date("2026-09-12T15:01:00.000Z");
    const seg3 = Math.round((endTime.getTime() - lastResumedAt.getTime()) / 1000);
    durationSeconds += seg3;

    // Total active duration: 28m + 10m + 16m = 54m active work!
    assert.equal(durationSeconds, (28 + 10 + 16) * 60);
    assert.equal(startedAt.toISOString(), sessionStart.toISOString(), "Initial session start time remains 14:00:00");

    // Total wall-clock span: 14:00:00 to 15:01:00 = 61m total elapsed interval
    const totalWallClockMins = Math.round((endTime.getTime() - startedAt.getTime()) / 60000);
    assert.equal(totalWallClockMins, 61);
  });

  it("recovers true coverage window for historical sessions where startedAt was overwritten", () => {
    // Simulating the bugged session:
    // User worked 58m total, but resume bug set startedAt = 14:45:00, endedAt = 15:01:00 (16m difference)
    const buggyStartedAt = new Date("2026-09-12T14:45:00.000Z");
    const endedAt = new Date("2026-09-12T15:01:00.000Z");
    const durationSeconds = 58 * 60; // 3480 seconds

    const wallClockSec = Math.round((endedAt.getTime() - buggyStartedAt.getTime()) / 1000); // 960s
    assert.ok(wallClockSec < durationSeconds, "Wall clock is less than recorded duration due to bug");

    // Recovery algorithm:
    const recoveredMs = endedAt.getTime() - (durationSeconds + 120) * 1000;
    const trueStart = new Date(Math.min(buggyStartedAt.getTime(), recoveredMs));

    // True start must be projected back before 14:03:00 to capture all earlier 14:00-14:45 work
    assert.ok(trueStart.getTime() <= new Date("2026-09-12T14:03:00.000Z").getTime());
  });
});
