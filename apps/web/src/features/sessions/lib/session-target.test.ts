import { describe, it, expect } from "vitest";
import { resolveSessionTargetState } from "./session-target";

describe("resolveSessionTargetState", () => {
  it("treats a missing target as open-ended (no seconds, no overtime)", () => {
    for (const missing of [null, undefined]) {
      const state = resolveSessionTargetState(missing, 3600);
      expect(state.targetMinutes).toBeNull();
      expect(state.targetSeconds).toBeNull();
      expect(state.remainingSeconds).toBeNull();
      expect(state.isOvertime).toBe(false);
    }
  });

  it("treats non-positive and non-finite targets as open-ended", () => {
    for (const invalid of [0, -25, Number.NaN, Number.POSITIVE_INFINITY]) {
      const state = resolveSessionTargetState(invalid, 600);
      expect(state.targetMinutes).toBeNull();
      expect(state.targetSeconds).toBeNull();
      expect(state.isOvertime).toBe(false);
    }
  });

  it("uses a real persisted target for remaining time", () => {
    const state = resolveSessionTargetState(50, 15 * 60);
    expect(state.targetMinutes).toBe(50);
    expect(state.targetSeconds).toBe(50 * 60);
    expect(state.remainingSeconds).toBe(35 * 60);
    expect(state.isOvertime).toBe(false);
  });

  it("is not overtime exactly at the target second", () => {
    const state = resolveSessionTargetState(25, 25 * 60);
    expect(state.remainingSeconds).toBe(0);
    expect(state.isOvertime).toBe(false);
  });

  it("is overtime only past the target", () => {
    const state = resolveSessionTargetState(25, 25 * 60 + 1);
    expect(state.remainingSeconds).toBe(-1);
    expect(state.isOvertime).toBe(true);
  });
});
