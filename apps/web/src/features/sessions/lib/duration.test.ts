import { describe, it, expect } from "vitest";
import {
  describeSessionSpan,
  formatSessionDuration,
  formatSessionDurationExact,
} from "./duration";

describe("formatSessionDuration", () => {
  it("formats minutes under an hour", () => {
    expect(formatSessionDuration(90)).toBe("1m");
    expect(formatSessionDuration(45 * 60)).toBe("45m");
  });

  it("floors instead of rounding (never overstates)", () => {
    expect(formatSessionDuration(45 * 60 + 59)).toBe("45m");
    expect(formatSessionDuration(3600 + 59)).toBe("1h");
  });

  it("formats hours and minutes", () => {
    expect(formatSessionDuration(90 * 60 + 60)).toBe("1h 31m");
    expect(formatSessionDuration(3600)).toBe("1h");
  });

  it("zero and null stay honest", () => {
    expect(formatSessionDuration(0)).toBe("0m");
    expect(formatSessionDuration(null)).toBe("—");
  });
});

describe("formatSessionDurationExact", () => {
  it("adds exact seconds for tooltips", () => {
    expect(formatSessionDurationExact(90 * 60 + 14)).toBe("1h 30m 14s");
    expect(formatSessionDurationExact(45)).toBe("45s");
  });
});

describe("describeSessionSpan", () => {
  it("wall == active → paused 0, no disclosure", () => {
    const span = describeSessionSpan(
      "2026-10-08T00:50:25.998Z",
      "2026-10-08T01:53:02.712Z",
      3757,
    );
    expect(span.wallDurationSeconds).toBe(3757);
    expect(span.activeDurationSeconds).toBe(3757);
    expect(span.pausedDurationSeconds).toBe(0);
    expect(span.hasMeaningfulPause).toBe(false);
  });

  it("gap below the 60s threshold → no meaningful pause", () => {
    const span = describeSessionSpan(
      "2026-10-08T00:50:25.000Z",
      "2026-10-08T01:53:02.000Z",
      3757 - 45,
    );
    expect(span.pausedDurationSeconds).toBe(45);
    expect(span.hasMeaningfulPause).toBe(false);
  });

  it("gap at/above threshold → meaningful pause", () => {
    const atThreshold = describeSessionSpan(
      "2026-10-08T00:50:25.000Z",
      "2026-10-08T01:50:25.000Z",
      3600 - 60,
    );
    expect(atThreshold.pausedDurationSeconds).toBe(60);
    expect(atThreshold.hasMeaningfulPause).toBe(true);
  });

  it("active > wall → paused clamped to 0, never negative", () => {
    const span = describeSessionSpan(
      "2026-09-12T14:45:00.000Z",
      "2026-09-12T15:01:00.000Z",
      58 * 60,
    );
    expect(span.wallDurationSeconds).toBe(960);
    expect(span.pausedDurationSeconds).toBe(0);
    expect(span.hasMeaningfulPause).toBe(false);
  });

  it("running session keeps existing live behavior (no invented wall)", () => {
    const span = describeSessionSpan("2026-10-08T00:50:25.998Z", null, 120);
    expect(span.wallDurationSeconds).toBeNull();
    expect(span.activeDurationSeconds).toBe(120);
    expect(span.pausedDurationSeconds).toBe(0);
    expect(span.hasMeaningfulPause).toBe(false);
  });

  it("invalid timestamps degrade to active-only, never NaN", () => {
    const span = describeSessionSpan("not-a-date", "also-bad", 100);
    expect(span.wallDurationSeconds).toBeNull();
    expect(span.activeDurationSeconds).toBe(100);
    expect(span.pausedDurationSeconds).toBe(0);
    expect(span.hasMeaningfulPause).toBe(false);
  });

  it("verified example: wall 6892s, active 3434s → paused 3458s", () => {
    const span = describeSessionSpan(
      "2026-10-07T20:12:14.936Z",
      "2026-10-07T22:07:07.107Z",
      3434,
    );
    expect(span.wallDurationSeconds).toBe(6892);
    expect(span.activeDurationSeconds).toBe(3434);
    expect(span.pausedDurationSeconds).toBe(3458);
    expect(span.hasMeaningfulPause).toBe(true);
    // Invariant: active + paused == wall.
    expect(span.activeDurationSeconds + span.pausedDurationSeconds).toBe(
      span.wallDurationSeconds,
    );
    // Exact tooltip values.
    expect(formatSessionDurationExact(span.activeDurationSeconds)).toBe("57m 14s");
    expect(formatSessionDurationExact(span.pausedDurationSeconds)).toBe("57m 38s");
    expect(formatSessionDurationExact(span.wallDurationSeconds)).toBe("1h 54m 52s");
    // Compact row values (canonical floor formatter, never overstates).
    expect(formatSessionDuration(span.activeDurationSeconds)).toBe("57m");
    expect(formatSessionDuration(span.pausedDurationSeconds)).toBe("57m");
    expect(formatSessionDuration(span.wallDurationSeconds)).toBe("1h 54m");
  });

  it("uninterrupted second session → focused only, no pause label", () => {
    const span = describeSessionSpan(
      "2026-10-08T00:50:25.998Z",
      "2026-10-08T01:53:02.712Z",
      3757,
    );
    expect(span.hasMeaningfulPause).toBe(false);
    expect(formatSessionDuration(span.activeDurationSeconds)).toBe("1h 2m");
  });
});
