import { describe, it, expect } from "vitest";
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
    expect(res.status).toBe("SUFFICIENT");
    expect(res.usableObservedSeconds).toBe(100);
    expect(res.unknownFraction).toBe(0);
  });

  it("fails coverage if unknown fraction exceeded", () => {
    const blocks = [
      createBlock(85, "OBSERVED"),
      createBlock(15, "UNKNOWN"), // 15% unknown, threshold is 10%
    ];
    const res = assessCoverage(blocks, baseConfig);
    expect(res.status).toBe("INDETERMINATE_COVERAGE");
    expect(res.isCoverageSufficient).toBe(false);
  });

  it("interrupts continuity on UNKNOWN if configured", () => {
    const config = { ...baseConfig, unknownHandling: "INTERRUPT_CONTINUITY" as const };
    const blocks = [
      createBlock(100, "OBSERVED"),
      createBlock(5, "UNKNOWN"),
    ];
    const res = assessCoverage(blocks, config);
    expect(res.status).toBe("INTERRUPTED");
  });

  it("terminates episode on UNKNOWN if configured", () => {
    const config = { ...baseConfig, unknownHandling: "TERMINATE_EPISODE" as const };
    const blocks = [
      createBlock(100, "OBSERVED"),
      createBlock(5, "UNKNOWN"), // triggers termination
      createBlock(100, "OBSERVED"), // Should be ignored
    ];
    const res = assessCoverage(blocks, config);
    expect(res.status).toBe("TERMINATED");
    expect(res.totalDurationSeconds).toBe(105);
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
    expect(res.unknownSeconds).toBe(10);
    expect(res.status).toBe("SUFFICIENT");
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
    expect(res.usableReportedSeconds).toBe(10);
    expect(res.unknownSeconds).toBe(0);
    expect(res.status).toBe("SUFFICIENT");
  });
});
