import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assessCoverage } from "./evidence";
import type { TemporalEvidenceBlock, PatternSufficiency } from "@repo/types";

describe("Phase 4: Evidence Qualification", () => {
  const baseConfig: PatternSufficiency = {
    requiredEvidenceQuality: {
      allowReportedOnly: false,
      allowExplainedGap: false,
      maxUnknownFraction: 0.1,
    },
    unknownHandling: "INDETERMINATE_IF_EXCEEDED",
  };

  const createBlock = (duration: number, coverage: any): TemporalEvidenceBlock => ({
    id: "b",
    startTime: "2026-09-14T10:00",
    endTime: "2026-09-14T11:00",
    durationSeconds: duration,
    coverage,
    provenance: [],
    observation: null,
    report: null,
    intention: null,
    outcome: null,
  });

  it("handles full observation", () => {
    const blocks = [createBlock(100, "OBSERVED")];
    const res = assessCoverage(blocks, baseConfig);
    assert.equal(res.status, "SUFFICIENT");
    assert.equal(res.usableObservedSeconds, 100);
    assert.equal(res.unknownFraction, 0);
  });

  it("fails coverage if unknown fraction exceeded", () => {
    const blocks = [
      createBlock(85, "OBSERVED"),
      createBlock(15, "UNKNOWN"), // 15% unknown, threshold is 10%
    ];
    const res = assessCoverage(blocks, baseConfig);
    assert.equal(res.status, "INDETERMINATE_COVERAGE");
    assert.equal(res.isCoverageSufficient, false);
  });

  it("interrupts continuity on UNKNOWN if configured", () => {
    const config = { ...baseConfig, unknownHandling: "INTERRUPT_CONTINUITY" as const };
    const blocks = [
      createBlock(100, "OBSERVED"),
      createBlock(5, "UNKNOWN"),
    ];
    const res = assessCoverage(blocks, config);
    assert.equal(res.status, "INTERRUPTED");
  });

  it("terminates episode on UNKNOWN if configured", () => {
    const config = { ...baseConfig, unknownHandling: "TERMINATE_EPISODE" as const };
    const blocks = [
      createBlock(100, "OBSERVED"),
      createBlock(5, "UNKNOWN"), // triggers termination
      createBlock(100, "OBSERVED"), // Should be ignored
    ];
    const res = assessCoverage(blocks, config);
    assert.equal(res.status, "TERMINATED");
    assert.equal(res.totalDurationSeconds, 105);
  });

  it("treats REPORTED as UNKNOWN if allowReportedOnly is false", () => {
    const blocks = [
      createBlock(90, "OBSERVED"),
      createBlock(10, "REPORTED"),
    ];
    // Threshold is 0.1, 10/100 is 0.1. So it should barely pass.
    const config = {
      ...baseConfig,
      requiredEvidenceQuality: { ...baseConfig.requiredEvidenceQuality, maxUnknownFraction: 0.1 }
    };
    const res = assessCoverage(blocks, config);
    assert.equal(res.unknownSeconds, 10);
    assert.equal(res.status, "SUFFICIENT");
  });

  it("accepts REPORTED if allowReportedOnly is true", () => {
    const blocks = [
      createBlock(90, "OBSERVED"),
      createBlock(10, "REPORTED"),
    ];
    const config = {
      ...baseConfig,
      requiredEvidenceQuality: { ...baseConfig.requiredEvidenceQuality, maxUnknownFraction: 0.0, allowReportedOnly: true }
    };
    const res = assessCoverage(blocks, config);
    assert.equal(res.usableReportedSeconds, 10);
    assert.equal(res.unknownSeconds, 0);
    assert.equal(res.status, "SUFFICIENT");
  });
});
