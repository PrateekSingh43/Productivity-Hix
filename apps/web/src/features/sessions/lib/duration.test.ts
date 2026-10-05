import { describe, it, expect } from "vitest";
import { formatSessionDuration, formatSessionDurationExact } from "./duration";

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
