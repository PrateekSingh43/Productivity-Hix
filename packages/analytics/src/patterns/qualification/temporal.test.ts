import { describe, it, expect } from "vitest";
import { countDistinctCalendarDays, isValidTemporalWindow, isValidBaselinePrecedence } from "./temporal";

describe("Phase 4: Temporal Qualification Guards", () => {
  it("isValidTemporalWindow strictly enforces start < end", () => {
    expect(isValidTemporalWindow("2026-09-14T10:00:00Z", "2026-09-14T11:00:00Z")).toBe(true);
    expect(isValidTemporalWindow("2026-09-14T11:00:00Z", "2026-09-14T10:00:00Z")).toBe(false); // inverted
    expect(isValidTemporalWindow("2026-09-14T10:00:00Z", "2026-09-14T10:00:00Z")).toBe(false); // zero duration
  });

  it("isValidBaselinePrecedence ensures baseline end is <= evaluation start", () => {
    expect(isValidBaselinePrecedence("2026-09-14T10:00:00Z", "2026-09-14T10:00:00Z")).toBe(true); // adjacent
    expect(isValidBaselinePrecedence("2026-09-14T09:00:00Z", "2026-09-14T10:00:00Z")).toBe(true); // precedes
    expect(isValidBaselinePrecedence("2026-09-14T11:00:00Z", "2026-09-14T10:00:00Z")).toBe(false); // leaks
  });

  it("countDistinctCalendarDays respects local timezone boundaries", () => {
    // 23:00 UTC and 01:00 UTC (next day)
    const timestamps = [
      "2026-09-14T23:00:00Z",
      "2026-09-15T01:00:00Z"
    ];

    // In UTC, they are on 14th and 15th -> 2 distinct days
    expect(countDistinctCalendarDays(timestamps, "UTC")).toBe(2);

    // In America/New_York (UTC-4), 23:00 UTC is 19:00 on the 14th, 
    // and 01:00 UTC (next day) is 21:00 on the 14th.
    // They both fall on the 14th -> 1 distinct day
    expect(countDistinctCalendarDays(timestamps, "America/New_York")).toBe(1);

    // In Asia/Kolkata (UTC+5:30), 23:00 UTC is 04:30 on the 15th,
    // and 01:00 UTC (next day) is 06:30 on the 15th.
    // They both fall on the 15th -> 1 distinct day
    expect(countDistinctCalendarDays(timestamps, "Asia/Kolkata")).toBe(1);
  });
});

