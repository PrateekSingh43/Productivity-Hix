import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  classifyMachineState,
  evaluateActivityAgainstExpectedRest,
} from "./availability";
import type { MachineAvailabilityEvidence, ExpectedRestWindow } from "@repo/types";

describe("Timeline Part A: Machine Availability & Expected Rest Contracts", () => {
  describe("Machine Availability Classification", () => {
    test("Scenario 15: Absence of machine evidence resolves to UNKNOWN, never SLEEP", () => {
      // Invariant: Long silence or missing telemetry is NEVER converted into SLEEP or POWER_OFF
      const resultNoEvidence = classifyMachineState(null);
      assert.equal(resultNoEvidence.state, "UNKNOWN");
      assert.equal(resultNoEvidence.reason, undefined);

      const resultUndefined = classifyMachineState(undefined);
      assert.equal(resultUndefined.state, "UNKNOWN");
    });

    test("Authoritative OS power event explicitly marks machine as UNAVAILABLE with SLEEP reason", () => {
      const evidence: MachineAvailabilityEvidence = {
        state: "UNAVAILABLE",
        reason: "SLEEP",
        source: "os_event",
        timestamp: new Date().toISOString(),
      };
      const result = classifyMachineState(evidence);
      assert.equal(result.state, "UNAVAILABLE");
      assert.equal(result.reason, "SLEEP");
    });

    test("Explicit running agent marks machine as AVAILABLE", () => {
      const evidence: MachineAvailabilityEvidence = {
        state: "AVAILABLE",
        source: "rust_agent",
        timestamp: new Date().toISOString(),
      };
      const result = classifyMachineState(evidence);
      assert.equal(result.state, "AVAILABLE");
    });
  });

  describe("Expected Rest Window Routine Context", () => {
    const routineSchedule: ExpectedRestWindow = {
      startLocalTime: "23:00",
      endLocalTime: "07:00",
      isEnabled: true,
    };

    test("Scenario 16: Activity occurring during ExpectedRestWindow remains valid OBSERVED_ACTIVITY", () => {
      // 02:00 AM on 2026-09-23 in UTC (during overnight rest window)
      const activityStart = new Date("2026-09-23T02:00:00.000Z");
      const activityEnd = new Date("2026-09-23T02:30:00.000Z");

      const evaluation = evaluateActivityAgainstExpectedRest({
        activityStart,
        activityEnd,
        restWindow: routineSchedule,
        timezone: "UTC",
      });

      // INVARIANT: Never suppressed, never penalized. Classification is ALWAYS OBSERVED_ACTIVITY.
      assert.equal(evaluation.activityClassification, "OBSERVED_ACTIVITY");
      assert.equal(evaluation.isWithinExpectedRest, true);
      assert.equal(evaluation.routineContextLabel, "EXPECTED_REST_WINDOW_OVERLAP");
    });

    test("Activity occurring during standard daytime is within standard routine", () => {
      // 14:00 (2:00 PM) on 2026-09-23 in UTC
      const activityStart = new Date("2026-09-23T14:00:00.000Z");
      const activityEnd = new Date("2026-09-23T15:00:00.000Z");

      const evaluation = evaluateActivityAgainstExpectedRest({
        activityStart,
        activityEnd,
        restWindow: routineSchedule,
        timezone: "UTC",
      });

      assert.equal(evaluation.activityClassification, "OBSERVED_ACTIVITY");
      assert.equal(evaluation.isWithinExpectedRest, false);
      assert.equal(evaluation.routineContextLabel, "STANDARD_ROUTINE");
    });

    test("Disabled rest window treats all activity as STANDARD_ROUTINE", () => {
      const disabledSchedule: ExpectedRestWindow = {
        ...routineSchedule,
        isEnabled: false,
      };
      const activityStart = new Date("2026-09-23T03:00:00.000Z");
      const activityEnd = new Date("2026-09-23T03:30:00.000Z");

      const evaluation = evaluateActivityAgainstExpectedRest({
        activityStart,
        activityEnd,
        restWindow: disabledSchedule,
        timezone: "UTC",
      });

      assert.equal(evaluation.activityClassification, "OBSERVED_ACTIVITY");
      assert.equal(evaluation.isWithinExpectedRest, false);
    });
  });
});
