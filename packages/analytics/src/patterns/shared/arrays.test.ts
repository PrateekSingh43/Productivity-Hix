import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalizeStringArray, sortObjectsDeterministically } from "./arrays";

describe("Phase 4: Shared Array Canonicalization", () => {
  it("canonicalizeStringArray deterministically sorts strings", () => {
    const input = ["session_C", "session_A", "session_B"];
    const expected = ["session_A", "session_B", "session_C"];
    assert.deepEqual(canonicalizeStringArray(input), expected);
  });

  it("canonicalizeStringArray deduplicates strings before sorting", () => {
    const input = ["caveat_B", "caveat_A", "caveat_B", "caveat_C"];
    const expected = ["caveat_A", "caveat_B", "caveat_C"];
    assert.deepEqual(canonicalizeStringArray(input), expected);
  });

  it("canonicalizeStringArray handles empty/null gracefully", () => {
    assert.equal(canonicalizeStringArray(null), undefined);
    assert.equal(canonicalizeStringArray(undefined), undefined);
    assert.equal(canonicalizeStringArray([]), undefined);
  });

  it("sortObjectsDeterministically sorts by primary and secondary keys deterministically", () => {
    const input = [
      { id: "2", val: "B" },
      { id: "1", val: "B" },
      { id: "3", val: "A" },
    ];
    
    // Sort primarily by val, secondarily by id
    const result = sortObjectsDeterministically(
      input,
      (item) => item.val,
      (item) => item.id
    );

    assert.deepEqual(result, [
      { id: "3", val: "A" },
      { id: "1", val: "B" },
      { id: "2", val: "B" },
    ]);
  });
});


