import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveProductiveDay,
  resolveTomorrowProductiveDay,
  formatProductiveDateLabel,
} from "../../types/src/productive-day";

describe("Productive Day Resolver", () => {
  test("canonical case: 02:30 on Sep 7 in Asia/Kolkata resolves to 2026-09-06", () => {
    // 02:30 AM local time on Sep 7, 2026 in Asia/Kolkata (+05:30)
    // In UTC: Sep 6, 21:00:00
    const instant = new Date("2026-09-06T21:00:00Z");
    const today = resolveProductiveDay(instant, {
      timezone: "Asia/Kolkata",
      boundary: "04:00",
    });
    assert.equal(today, "2026-09-06");

    // Tomorrow relative to 2026-09-06 is 2026-09-07
    const tomorrow = resolveTomorrowProductiveDay(instant, {
      timezone: "Asia/Kolkata",
      boundary: "04:00",
    });
    assert.equal(tomorrow, "2026-09-07");
  });

  test("canonical case: 09:05 on Sep 7 in Asia/Kolkata resolves to 2026-09-07", () => {
    // 09:05 AM local time on Sep 7, 2026 in Asia/Kolkata (+05:30)
    // In UTC: Sep 7, 03:35:00
    const instant = new Date("2026-09-07T03:35:00Z");
    const today = resolveProductiveDay(instant, {
      timezone: "Asia/Kolkata",
      boundary: "04:00",
    });
    assert.equal(today, "2026-09-07");

    // Tomorrow relative to 2026-09-07 is 2026-09-08
    const tomorrow = resolveTomorrowProductiveDay(instant, {
      timezone: "Asia/Kolkata",
      boundary: "04:00",
    });
    assert.equal(tomorrow, "2026-09-08");
  });

  test("boundary edge test: 03:59:59 is yesterday, 04:00:00 is today", () => {
    // New York (-04:00 during EDT):
    // 03:59:59 EDT -> 07:59:59 UTC on Sep 7
    const beforeBoundary = new Date("2026-09-07T07:59:59Z");
    assert.equal(
      resolveProductiveDay(beforeBoundary, {
        timezone: "America/New_York",
        boundary: "04:00",
      }),
      "2026-09-06"
    );

    // 04:00:00 EDT -> 08:00:00 UTC on Sep 7
    const atBoundary = new Date("2026-09-07T08:00:00Z");
    assert.equal(
      resolveProductiveDay(atBoundary, {
        timezone: "America/New_York",
        boundary: "04:00",
      }),
      "2026-09-07"
    );
  });

  test("formatProductiveDateLabel formats short readable label", () => {
    const label = formatProductiveDateLabel("2026-09-07");
    assert.match(label, /Sep 7/);
  });
});
