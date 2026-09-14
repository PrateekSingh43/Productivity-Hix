import { describe, it } from "node:test";
import assert from "node:assert";
import { percentile, median, iqr, recurrenceFraction, deltaRatio } from "./statistics";

describe("Baseline: Statistics", () => {
  describe("percentile (Method-7)", () => {
    it("should compute exact values when h is an integer", () => {
      // 1-based h = 1 + (N - 1)p. For N = 5, p = 0.25 -> h = 1 + 4*0.25 = 2.
      // So the 25th percentile should be the 2nd element (index 1).
      const values = [10, 20, 30, 40, 50];
      assert.strictEqual(percentile(values, 0.25), 20);
      
      // p = 0.5 -> h = 1 + 4*0.5 = 3 (index 2).
      assert.strictEqual(percentile(values, 0.5), 30);
      
      // p = 0.75 -> h = 1 + 4*0.75 = 4 (index 3).
      assert.strictEqual(percentile(values, 0.75), 40);
    });

    it("should interpolate when h is fractional", () => {
      // N = 4. p = 0.5 -> h = 1 + 3*0.5 = 2.5.
      // Index 1 (2nd element) and index 2 (3rd element) interpolated by 0.5.
      const values = [10, 20, 30, 40];
      assert.strictEqual(percentile(values, 0.5), 25);
    });

    it("should handle p = 0 and p = 1", () => {
      const values = [5, 10, 15, 20];
      assert.strictEqual(percentile(values, 0), 5);
      assert.strictEqual(percentile(values, 1), 20);
    });

    it("should handle empty or invalid arrays", () => {
      assert.strictEqual(percentile([], 0.5), null);
      assert.strictEqual(percentile([NaN, Infinity], 0.5), null);
    });

    it("should ignore invalid values during sorting", () => {
      // N = 3 after filtering out NaN
      const values = [10, NaN, 20, 30];
      // h = 1 + 2*0.5 = 2.
      assert.strictEqual(percentile(values, 0.5), 20);
    });
  });

  describe("median", () => {
    it("should average the two central values for even N", () => {
      assert.strictEqual(median([1, 2, 3, 4]), 2.5);
    });

    it("should return the central value for odd N", () => {
      assert.strictEqual(median([1, 2, 3, 4, 5]), 3);
    });
  });

  describe("iqr", () => {
    it("should return Q3 - Q1", () => {
      // Q1 = 20, Q3 = 40. IQR = 20.
      assert.strictEqual(iqr([10, 20, 30, 40, 50]), 20);
    });

    it("should handle zero IQR", () => {
      assert.strictEqual(iqr([5, 5, 5, 5]), 0);
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

  describe("deltaRatio", () => {
    it("should compute safe relative deviation", () => {
      // (15 - 10) / 10 = +0.5
      assert.strictEqual(deltaRatio(15, 10), 0.5);
      // (5 - 10) / 10 = -0.5
      assert.strictEqual(deltaRatio(5, 10), -0.5);
    });

    it("should return null for zero or negative baseline", () => {
      assert.strictEqual(deltaRatio(15, 0), null);
      assert.strictEqual(deltaRatio(15, -5), null);
    });

    it("should handle null inputs", () => {
      assert.strictEqual(deltaRatio(null, 10), null);
      assert.strictEqual(deltaRatio(15, null), null);
    });
  });
});
