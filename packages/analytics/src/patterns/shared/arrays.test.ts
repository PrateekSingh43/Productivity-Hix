import { describe, it, expect } from "vitest";
import { canonicalizeStringArray, sortObjectsDeterministically } from "./arrays";

describe("Phase 4: Shared Array Canonicalization", () => {
  it("canonicalizeStringArray deterministically sorts strings", () => {
    const input = ["session_C", "session_A", "session_B"];
    const expected = ["session_A", "session_B", "session_C"];
    expect(canonicalizeStringArray(input)).toEqual(expected);
  });

  it("canonicalizeStringArray deduplicates strings before sorting", () => {
    const input = ["caveat_B", "caveat_A", "caveat_B", "caveat_C"];
    const expected = ["caveat_A", "caveat_B", "caveat_C"];
    expect(canonicalizeStringArray(input)).toEqual(expected);
  });

  it("canonicalizeStringArray handles empty/null gracefully", () => {
    expect(canonicalizeStringArray(null)).toBe(undefined);
    expect(canonicalizeStringArray(undefined)).toBe(undefined);
    expect(canonicalizeStringArray([])).toBe(undefined);
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

    expect(result).toEqual([
      { id: "3", val: "A" },
      { id: "1", val: "B" },
      { id: "2", val: "B" },
    ]);
  });
});

