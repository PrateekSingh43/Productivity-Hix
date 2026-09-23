import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveLocalDayInterval,
  getDatesIntersectingInterval,
  localDateTimeToUtc,
} from "../../types/src/productive-day";

describe("Canonical Local-Day Partitioning & Interval Semantics", () => {
  test("Scenario 1: Asia/Kolkata standard day interval has duration 24 hours", () => {
    const iv = resolveLocalDayInterval("2026-09-23", { timezone: "Asia/Kolkata" });
    assert.equal(iv.localDate, "2026-09-23");
    assert.equal(iv.timezone, "Asia/Kolkata");
    assert.equal(iv.startIso, "2026-09-22T18:30:00.000Z");
    assert.equal(iv.endIso, "2026-09-23T18:30:00.000Z");
    assert.equal(iv.durationMs, 24 * 60 * 60 * 1000);
  });

  test("Scenario 2: America/New_York spring-forward 2026-03-08 has duration 23 hours", () => {
    // On 2026-03-08, 2:00 AM clocks skip to 3:00 AM (EDT begins)
    const iv = resolveLocalDayInterval("2026-03-08", { timezone: "America/New_York" });
    assert.equal(iv.localDate, "2026-03-08");
    assert.equal(iv.startIso, "2026-03-08T05:00:00.000Z");
    assert.equal(iv.endIso, "2026-03-09T04:00:00.000Z");
    assert.equal(iv.durationMs, 23 * 60 * 60 * 1000);
  });

  test("Scenario 3: America/New_York fall-back 2026-11-01 has duration 25 hours", () => {
    // On 2026-11-01, 2:00 AM clocks fall back to 1:00 AM (EST begins)
    const iv = resolveLocalDayInterval("2026-11-01", { timezone: "America/New_York" });
    assert.equal(iv.localDate, "2026-11-01");
    assert.equal(iv.startIso, "2026-11-01T04:00:00.000Z");
    assert.equal(iv.endIso, "2026-11-02T05:00:00.000Z");
    assert.equal(iv.durationMs, 25 * 60 * 60 * 1000);
  });

  test("Scenario 4: Boundary exactness: 23:59:30 + 30s (ends 00:00:00) touches Day 1 ONLY", () => {
    // In UTC: 2026-09-23 23:59:30 + 30s ends at exactly 2026-09-24 00:00:00.000Z
    const start = new Date("2026-09-23T23:59:30.000Z");
    const end = new Date("2026-09-24T00:00:00.000Z");
    const touched = getDatesIntersectingInterval(start, end, "UTC");
    assert.equal(touched.length, 1);
    assert.equal(touched[0]!.localDate, "2026-09-23");
  });

  test("Scenario 5: Boundary exactness: 23:59:30 + 31s (ends 00:00:01) touches Day 1 AND Day 2", () => {
    // In UTC: 2026-09-23 23:59:30 + 31s ends at 2026-09-24 00:00:01.000Z
    const start = new Date("2026-09-23T23:59:30.000Z");
    const end = new Date("2026-09-24T00:00:01.000Z");
    const touched = getDatesIntersectingInterval(start, end, "UTC");
    assert.equal(touched.length, 2);
    assert.equal(touched[0]!.localDate, "2026-09-23");
    assert.equal(touched[1]!.localDate, "2026-09-24");
  });

  test("Boundary exactness in user timezone (Asia/Kolkata): 23:59:30 + 30s vs + 31s", () => {
    const kolStart = localDateTimeToUtc(2026, 9, 23, 23, 59, 30, "Asia/Kolkata");
    const kolEnd30 = new Date(kolStart.getTime() + 30_000);
    const kolEnd31 = new Date(kolStart.getTime() + 31_000);

    const touched30 = getDatesIntersectingInterval(kolStart, kolEnd30, "Asia/Kolkata");
    assert.equal(touched30.length, 1);
    assert.equal(touched30[0]!.localDate, "2026-09-23");

    const touched31 = getDatesIntersectingInterval(kolStart, kolEnd31, "Asia/Kolkata");
    assert.equal(touched31.length, 2);
    assert.equal(touched31[0]!.localDate, "2026-09-23");
    assert.equal(touched31[1]!.localDate, "2026-09-24");
  });

  test("Multi-day spanning event touches all intermediate days", () => {
    // 3 days span
    const start = new Date("2026-09-20T10:00:00.000Z");
    const end = new Date("2026-09-22T14:00:00.000Z");
    const touched = getDatesIntersectingInterval(start, end, "UTC");
    assert.equal(touched.length, 3);
    assert.equal(touched[0]!.localDate, "2026-09-20");
    assert.equal(touched[1]!.localDate, "2026-09-21");
    assert.equal(touched[2]!.localDate, "2026-09-22");
  });
});
