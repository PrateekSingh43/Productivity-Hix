import { describe, it, expect } from "vitest";
import { safeDivide, isValidFinite } from "./math";

describe("Phase 4: Shared Math Guards", () => {
  it("safeDivide handles zero denominator safely", () => {
    expect(safeDivide(10, 0)).toBe(null);
    expect(safeDivide(0, 0)).toBe(null);
  });

  it("safeDivide handles null/undefined inputs", () => {
    expect(safeDivide(null, 10)).toBe(null);
    expect(safeDivide(10, null)).toBe(null);
    expect(safeDivide(undefined, 10)).toBe(null);
  });

  it("safeDivide computes normal division", () => {
    expect(safeDivide(10, 2)).toBe(5);
    expect(safeDivide(-10, 2)).toBe(-5);
  });

  it("isValidFinite identifies safe numbers", () => {
    expect(isValidFinite(10)).toBe(true);
    expect(isValidFinite(0)).toBe(true);
    expect(isValidFinite(NaN)).toBe(false);
    expect(isValidFinite(Infinity)).toBe(false);
    expect(isValidFinite(-Infinity)).toBe(false);
    expect(isValidFinite(null)).toBe(false);
    expect(isValidFinite("10")).toBe(false);
  });
});
