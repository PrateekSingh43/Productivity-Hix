import { describe, it } from "node:test";
import assert from "node:assert";
import { enforceAntiLeakage, type HistoricalWindow } from "./source";

describe("Baseline: enforceAntiLeakage", () => {
  it("should not throw if the historical window ends strictly before the evaluation start", () => {
    const window: HistoricalWindow = { start: "2023-01-01T00:00:00Z", end: "2023-01-15T00:00:00Z" };
    assert.doesNotThrow(() => enforceAntiLeakage(window, "2023-01-16T00:00:00Z"));
  });

  it("should not throw if the historical window ends exactly at the evaluation start", () => {
    const window: HistoricalWindow = { start: "2023-01-01T00:00:00Z", end: "2023-01-15T00:00:00Z" };
    assert.doesNotThrow(() => enforceAntiLeakage(window, "2023-01-15T00:00:00Z"));
  });

  it("should throw if the historical window ends after the evaluation start", () => {
    const window: HistoricalWindow = { start: "2023-01-01T00:00:00Z", end: "2023-01-16T00:00:00Z" };
    assert.throws(
      () => enforceAntiLeakage(window, "2023-01-15T00:00:00Z"),
      /Baseline leakage detected/
    );
  });

  it("should throw if the timestamps are invalid", () => {
    const window: HistoricalWindow = { start: "2023-01-01T00:00:00Z", end: "invalid" };
    assert.throws(() => enforceAntiLeakage(window, "2023-01-15T00:00:00Z"), /Invalid baseline window end/);

    const window2: HistoricalWindow = { start: "2023-01-01T00:00:00Z", end: "2023-01-15T00:00:00Z" };
    assert.throws(() => enforceAntiLeakage(window2, "invalid"), /Invalid evaluation start/);
  });
});
