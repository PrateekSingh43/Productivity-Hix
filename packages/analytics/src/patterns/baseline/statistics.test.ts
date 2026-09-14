import { describe, it } from "node:test";
import assert from "node:assert";
import { percentile, median, iqr, recurrenceFraction, signedRelativeChange } from "./statistics";

describe("Baseline: Statistics", () => {
  describe("percentile (Method-7)", () => {
    it("should compute exact values when h is an integer", () => {
      const values = [10, 20, 30, 40, 50];
      assert.strictEqual(percentile(values, 0.25), 20);
      assert.strictEqual(percentile(values, 0.5), 30);
      assert.strictEqual(percentile(values, 0.75), 40);
    });

    it("should interpolate when h is fractional", () => {
      const values = [10, 20, 30, 40];
      assert.strictEqual(percentile(values, 0.5), 25);
    });

    it("should handle p = 0 and p = 1", () => {
      const values = [5, 10, 15, 20];
      assert.strictEqual(percentile(values, 0), 5);
      assert.strictEqual(percentile(values, 1), 20);
    });

    it("should return null for empty arrays or invalid p", () => {
      assert.strictEqual(percentile([], 0.5), null);
      assert.strictEqual(percentile([1, 2], -0.1), null);
      assert.strictEqual(percentile([1, 2], 1.1), null);
    });

    it("should return null immediately if any value is non-finite (do not silently filter)", () => {
      assert.strictEqual(percentile([10, NaN, 20, 30], 0.5), null);
      assert.strictEqual(percentile([10, Infinity, 20], 0.5), null);
    });
  });

  describe("median", () => {
    it("should average the two central values for even N", () => {
      assert.strictEqual(median([1, 2, 3, 4]), 2.5);
    });

    it("should return the central value for odd N", () => {
      assert.strictEqual(median([1, 2, 3, 4, 5]), 3);
    });

    it("should return null for empty", () => {
      assert.strictEqual(median([]), null);
    });
  });

  describe("iqr", () => {
    it("should return Q3 - Q1", () => {
      assert.strictEqual(iqr([10, 20, 30, 40, 50]), 20);
    });

    it("should handle zero IQR", () => {
      assert.strictEqual(iqr([5, 5, 5, 5]), 0);
    });

    it("should return null for empty or invalid", () => {
      assert.strictEqual(iqr([]), null);
      assert.strictEqual(iqr([10, NaN]), null);
    });
  });

  describe("recurrenceFraction", () => {
    it("should compute safe fraction", () => {
      assert.strictEqual(recurrenceFraction(3, 5), 0.6);
      assert.strictEqual(recurrenceFraction(0, 5), 0);
    });

    it("should handle zero total qualifying", () => {
      assert.strictEqual(recurrenceFraction(3, 0), null);
    });

    it("should handle invalid counts", () => {
      assert.strictEqual(recurrenceFraction(-1, 5), null);
      assert.strictEqual(recurrenceFraction(3, -1), null);
    });
  });

  describe("signedRelativeChange", () => {
    it("should compute safe signed relative change", () => {
      assert.strictEqual(signedRelativeChange(15, 10), 0.5);
      assert.strictEqual(signedRelativeChange(5, 10), -0.5);
    });

    it("should return null for zero or negative baseline", () => {
      assert.strictEqual(signedRelativeChange(15, 0), null);
      assert.strictEqual(signedRelativeChange(15, -5), null);
    });

    it("should handle null inputs", () => {
      assert.strictEqual(signedRelativeChange(null, 10), null);
      assert.strictEqual(signedRelativeChange(15, null), null);
    });
  });

  describe("Determinism", () => {
    it("identical populations with different input ordering produce identical results", () => {
      const pop1 = [50, 10, 40, 20, 30];
      const pop2 = [10, 20, 30, 40, 50]; // sorted
      const pop3 = [30, 50, 10, 20, 40]; // shuffled

      assert.strictEqual(median(pop1), median(pop2));
      assert.strictEqual(median(pop2), median(pop3));

      assert.strictEqual(percentile(pop1, 0.25), percentile(pop3, 0.25));
      assert.strictEqual(percentile(pop1, 0.8), percentile(pop3, 0.8));

      assert.strictEqual(iqr(pop1), iqr(pop2));
      assert.strictEqual(iqr(pop2), iqr(pop3));
    });
  });
});
