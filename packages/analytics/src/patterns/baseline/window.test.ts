import { describe, it } from "node:test";
import assert from "node:assert";
import { enforceAntiLeakage, type HistoricalWindow } from "./source";

describe("Baseline: enforceAntiLeakage", () => {
  it("should not throw if window is valid and ends strictly before evaluation start", () => {
    const window: HistoricalWindow = { start: "2023-01-01T00:00:00Z", end: "2023-01-15T00:00:00Z" };
    assert.doesNotThrow(() => enforceAntiLeakage(window, "2023-01-16T00:00:00Z"));
  });

  it("should not throw if window is valid and ends exactly at evaluation start", () => {
    const window: HistoricalWindow = { start: "2023-01-01T00:00:00Z", end: "2023-01-15T00:00:00Z" };
    assert.doesNotThrow(() => enforceAntiLeakage(window, "2023-01-15T00:00:00Z"));
  });

  it("should throw if the historical window ends after evaluation start", () => {
    const window: HistoricalWindow = { start: "2023-01-01T00:00:00Z", end: "2023-01-16T00:00:00Z" };
    assert.throws(
      () => enforceAntiLeakage(window, "2023-01-15T00:00:00Z"),
      /Baseline leakage detected/
    );
  });

  it("should throw if start == end (empty window)", () => {
    const window: HistoricalWindow = { start: "2023-01-01T00:00:00Z", end: "2023-01-01T00:00:00Z" };
    assert.throws(() => enforceAntiLeakage(window, "2023-01-15T00:00:00Z"), /strictly before/);
  });

  it("should throw if start > end (inverted window)", () => {
    const window: HistoricalWindow = { start: "2023-01-10T00:00:00Z", end: "2023-01-01T00:00:00Z" };
    assert.throws(() => enforceAntiLeakage(window, "2023-01-15T00:00:00Z"), /strictly before/);
  });

  it("should throw if timestamps are invalid", () => {
    const invalidStart: HistoricalWindow = { start: "invalid", end: "2023-01-15T00:00:00Z" };
    assert.throws(() => enforceAntiLeakage(invalidStart, "2023-01-16T00:00:00Z"), /Invalid baseline window start/);

    const invalidEnd: HistoricalWindow = { start: "2023-01-01T00:00:00Z", end: "invalid" };
    assert.throws(() => enforceAntiLeakage(invalidEnd, "2023-01-15T00:00:00Z"), /Invalid baseline window end/);

    const validWindow: HistoricalWindow = { start: "2023-01-01T00:00:00Z", end: "2023-01-15T00:00:00Z" };
    assert.throws(() => enforceAntiLeakage(validWindow, "invalid"), /Invalid evaluation start/);
  });
});
