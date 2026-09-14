import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeDivide, isValidFinite } from "./math";

describe("Phase 4: Shared Math Guards", () => {
  it("safeDivide handles zero denominator safely", () => {
    assert.equal(safeDivide(10, 0), null);
    assert.equal(safeDivide(0, 0), null);
  });

  it("safeDivide handles null/undefined inputs", () => {
    assert.equal(safeDivide(null, 10), null);
    assert.equal(safeDivide(10, null), null);
    assert.equal(safeDivide(undefined, 10), null);
  });

  it("safeDivide computes normal division", () => {
    assert.equal(safeDivide(10, 2), 5);
    assert.equal(safeDivide(-10, 2), -5);
  });

  it("isValidFinite identifies safe numbers", () => {
    assert.equal(isValidFinite(10), true);
    assert.equal(isValidFinite(0), true);
    assert.equal(isValidFinite(NaN), false);
    assert.equal(isValidFinite(Infinity), false);
    assert.equal(isValidFinite(-Infinity), false);
    assert.equal(isValidFinite(null), false);
    assert.equal(isValidFinite("10"), false);
  });
});
