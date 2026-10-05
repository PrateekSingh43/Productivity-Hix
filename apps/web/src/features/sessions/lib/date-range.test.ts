import { describe, it, expect } from "vitest";
import { resolveSessionDateRange } from "./date-range";

const KOLKATA = { timezone: "Asia/Kolkata", boundary: "04:00" };

describe("resolveSessionDateRange", () => {
  it("today resolves the current productive day with the 04:00 boundary", () => {
    // 01:30 UTC = 07:00 IST Oct 4 → productive day Oct 4.
    const out = resolveSessionDateRange("today", {
      ...KOLKATA,
      now: new Date("2026-10-04T01:30:00.000Z"),
    });
    expect(out).toEqual({
      from: "2026-10-03T22:30:00.000Z", // Oct 4 04:00 IST
      to: "2026-10-04T22:30:00.000Z", // Oct 5 04:00 IST
    });
  });

  it("pre-boundary instants belong to the previous productive day", () => {
    // 21:30 UTC Oct 3 = 03:00 IST Oct 4 (< 04:00) → productive day Oct 3.
    const out = resolveSessionDateRange("today", {
      ...KOLKATA,
      now: new Date("2026-10-03T21:30:00.000Z"),
    });
    expect(out.from).toBe("2026-10-02T22:30:00.000Z"); // Oct 3 04:00 IST
  });

  it("7d covers the last 7 productive days inclusive of today", () => {
    const out = resolveSessionDateRange("7d", {
      ...KOLKATA,
      now: new Date("2026-10-04T01:30:00.000Z"),
    });
    expect(out).toEqual({
      from: "2026-09-27T22:30:00.000Z", // Sep 28 04:00 IST
      to: "2026-10-04T22:30:00.000Z",
    });
  });

  it("custom range spans whole productive days half-open", () => {
    const out = resolveSessionDateRange("custom", {
      timezone: "UTC",
      boundary: "00:00",
      customFrom: "2026-09-18",
      customTo: "2026-10-02",
    });
    expect(out).toEqual({
      from: "2026-09-18T00:00:00.000Z",
      to: "2026-10-03T00:00:00.000Z",
    });
  });

  it("custom range rejects an inverted window", () => {
    expect(() =>
      resolveSessionDateRange("custom", {
        timezone: "UTC",
        boundary: "00:00",
        customFrom: "2026-10-02",
        customTo: "2026-09-18",
      }),
    ).toThrow();
  });

  it("all returns an unbounded range", () => {
    expect(resolveSessionDateRange("all", { ...KOLKATA })).toEqual({});
  });
});
