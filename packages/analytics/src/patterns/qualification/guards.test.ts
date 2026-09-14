import { describe, it, expect } from "vitest";
import { resolveNumericRequirement, isRequirementSatisfied, isValidTaskAttribution, isValidGeneralAttribution } from "./guards";
import type { IntentionEvidence } from "@repo/types";

describe("Phase 4: Qualification Guards", () => {
  it("resolveNumericRequirement handles null, undefined, and values correctly", () => {
    // null disables the requirement
    expect(resolveNumericRequirement(null, 5)).toBe(null);
    
    // undefined falls back to default
    expect(resolveNumericRequirement(undefined, 5)).toBe(5);
    
    // number enforces explicitly
    expect(resolveNumericRequirement(10, 5)).toBe(10);
  });

  it("isRequirementSatisfied handles null correctly (disabled requirement)", () => {
    expect(isRequirementSatisfied(2, null, "GTE")).toBe(true);
  });

  it("isRequirementSatisfied enforces GTE correctly", () => {
    expect(isRequirementSatisfied(5, 5, "GTE")).toBe(true);
    expect(isRequirementSatisfied(6, 5, "GTE")).toBe(true);
    expect(isRequirementSatisfied(4, 5, "GTE")).toBe(false);
  });

  it("isValidTaskAttribution strictly requires EXPLICIT link and valid taskId", () => {
    const valid: IntentionEvidence = {
      linkType: "EXPLICIT",
      taskId: "task_1",
      targetScope: "TASK"
    };
    expect(isValidTaskAttribution(valid)).toBe(true);

    const missingTaskId: IntentionEvidence = {
      linkType: "EXPLICIT",
      targetScope: "TASK"
    };
    expect(isValidTaskAttribution(missingTaskId)).toBe(false);

    const inferredLink: IntentionEvidence = {
      linkType: "INFERRED",
      taskId: "task_1",
      targetScope: "TASK"
    };
    expect(isValidTaskAttribution(inferredLink)).toBe(false);

    const unknownLink: IntentionEvidence = {
      linkType: "UNKNOWN",
      targetScope: "TASK"
    };
    expect(isValidTaskAttribution(unknownLink)).toBe(false);

    expect(isValidTaskAttribution(null)).toBe(false);
    expect(isValidTaskAttribution(undefined)).toBe(false);
  });

  it("isValidGeneralAttribution always passes", () => {
    expect(isValidGeneralAttribution()).toBe(true);
  });
});

