import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countDistinctCalendarDays, isValidTemporalWindow, isValidBaselinePrecedence, subtractCalendarDays } from "./temporal";

describe("Phase 4: Temporal Qualification Guards", () => {
  it("isValidTemporalWindow strictly enforces start < end", () => {
    assert.equal(isValidTemporalWindow("2026-09-14T10:00:00Z", "2026-09-14T11:00:00Z"), true);
    assert.equal(isValidTemporalWindow("2026-09-14T11:00:00Z", "2026-09-14T10:00:00Z"), false); // inverted
    assert.equal(isValidTemporalWindow("2026-09-14T10:00:00Z", "2026-09-14T10:00:00Z"), false); // zero duration
  });

  it("isValidBaselinePrecedence ensures baseline end is <= evaluation start", () => {
    assert.strictEqual(isValidBaselinePrecedence("2023-01-01T00:00:00Z", "2023-01-01T00:00:00Z"), true);
    assert.strictEqual(isValidBaselinePrecedence("2023-01-01T00:00:00Z", "2023-01-01T00:00:01Z"), true);
    assert.strictEqual(isValidBaselinePrecedence("2023-01-01T00:00:01Z", "2023-01-01T00:00:00Z"), false);
  });

  it("subtractCalendarDays correctly subtracts 30 days handling exact same local time across DST", () => {
    // Nov 15 2023 in Los Angeles is standard time (UTC-8)
    // 08:00:00Z is Midnight (00:00) Nov 15 in LA.
    const start = "2023-11-15T08:00:00.000Z";
    const res = subtractCalendarDays(start, 30, "America/Los_Angeles");
    
    // 30 days before Nov 15 is Oct 16. Oct 16 is Daylight Saving Time (UTC-7)
    // So midnight Oct 16 in LA is 07:00:00Z.
    assert.strictEqual(res, "2023-10-16T07:00:00.000Z");
  });

  it("countDistinctCalendarDays respects local timezone boundaries", () => {
    // 23:00 UTC and 01:00 UTC (next day)
    const timestamps = [
      "2026-09-14T23:00:00Z",
      "2026-09-15T01:00:00Z"
    ];

    // In UTC, they are on 14th and 15th -> 2 distinct days
    assert.equal(countDistinctCalendarDays(timestamps, "UTC"), 2);

    // In America/New_York (UTC-4), 23:00 UTC is 19:00 on the 14th, 
    // and 01:00 UTC (next day) is 21:00 on the 14th.
    // They both fall on the 14th -> 1 distinct day
    assert.equal(countDistinctCalendarDays(timestamps, "America/New_York"), 1);

    // In Asia/Kolkata (UTC+5:30), 23:00 UTC is 04:30 on the 15th,
    // and 01:00 UTC (next day) is 06:30 on the 15th.
    // They both fall on the 15th -> 1 distinct day
    assert.equal(countDistinctCalendarDays(timestamps, "Asia/Kolkata"), 1);
  });
});

