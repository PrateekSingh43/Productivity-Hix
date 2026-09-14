import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveNumericRequirement, isRequirementSatisfied, isValidTaskAttribution, isValidGeneralAttribution } from "./guards";
import type { IntentionEvidence } from "@repo/types";

describe("Phase 4: Qualification Guards", () => {
  it("resolveNumericRequirement handles null, undefined, and values correctly", () => {
    // null disables the requirement
    assert.equal(resolveNumericRequirement(null, 5), null);
    
    // undefined falls back to default
    assert.equal(resolveNumericRequirement(undefined, 5), 5);
    
    // number enforces explicitly
    assert.equal(resolveNumericRequirement(10, 5), 10);
  });

  it("isRequirementSatisfied handles null correctly (disabled requirement)", () => {
    assert.equal(isRequirementSatisfied(2, null, "GTE"), true);
  });

  it("isRequirementSatisfied enforces GTE correctly", () => {
    assert.equal(isRequirementSatisfied(5, 5, "GTE"), true);
    assert.equal(isRequirementSatisfied(6, 5, "GTE"), true);
    assert.equal(isRequirementSatisfied(4, 5, "GTE"), false);
  });

  it("isValidTaskAttribution strictly requires EXPLICIT link and valid taskId", () => {
    const valid: IntentionEvidence = {
      linkType: "EXPLICIT",
      taskId: "task_1",
      targetScope: "TASK"
    };
    assert.equal(isValidTaskAttribution(valid), true);

    const missingTaskId: IntentionEvidence = {
      linkType: "EXPLICIT",
      targetScope: "TASK"
    };
    assert.equal(isValidTaskAttribution(missingTaskId), false);

    const inferredLink: IntentionEvidence = {
      linkType: "INFERRED",
      taskId: "task_1",
      targetScope: "TASK"
    };
    assert.equal(isValidTaskAttribution(inferredLink), false);

    const unknownLink: IntentionEvidence = {
      linkType: "UNKNOWN",
      targetScope: "TASK"
    };
    assert.equal(isValidTaskAttribution(unknownLink), false);

    assert.equal(isValidTaskAttribution(null), false);
    assert.equal(isValidTaskAttribution(undefined), false);
  });

  it("isValidGeneralAttribution always passes", () => {
    assert.equal(isValidGeneralAttribution(), true);
  });
});
