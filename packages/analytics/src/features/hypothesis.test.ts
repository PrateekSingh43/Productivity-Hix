import { strict as assert } from "node:assert";
import { test } from "node:test";
import { extractSessionFeatures } from "./session";
import { extractDayFeatures } from "./day";
import { extractTransitionFeatures } from "./transitions";
import { extractCheckInFeatures } from "./check-in";
import { extractTaskFeatures } from "./task";
import type { CheckIn, Task, TimelineSegment, WorkSession } from "@repo/types";

/**
 * Phase 2 Hypothesis Test:
 * "If corrected telemetry and existing task/check-in/session data are converted into a consistent feature model,
 *  future analytical detectors can operate on the same definitions without independently interpreting raw events."
 */

test("hypothesis H2: analytical detectors operate on canonical feature model without reinterpreting raw events", () => {
  // 1. Given canonical session and timeline segments:
  const session: WorkSession = {
    id: "derived-1",
    taskId: null,
    startedAt: "2026-01-01T10:00:00.000Z",
    endedAt: "2026-01-01T11:00:00.000Z",
    durationSeconds: 3600,
    source: "derived",
  };

  const segments: TimelineSegment[] = [
    {
      id: "s1",
      start: "2026-01-01T10:00:00.000Z",
      end: "2026-01-01T10:30:00.000Z",
      durationMs: 1800_000,
      durationSeconds: 1800,
      source: "desktop",
      type: "application",
      application: "Code",
      title: "auth.ts",
      category: "focused",
    },
    {
      id: "s2",
      start: "2026-01-01T10:30:00.000Z",
      end: "2026-01-01T10:45:00.000Z",
      durationMs: 900_000,
      durationSeconds: 900,
      source: "browser",
      type: "browser",
      application: "Chrome",
      title: "YouTube",
      category: "leisure",
    },
    {
      id: "s3",
      start: "2026-01-01T10:45:00.000Z",
      end: "2026-01-01T11:00:00.000Z",
      durationMs: 900_000,
      durationSeconds: 900,
      source: "desktop",
      type: "application",
      application: "Code",
      title: "auth.ts",
      category: "focused",
    },
  ];

  // Extract canonical features once
  const sessionFeat = extractSessionFeatures(session, segments);
  const transitionFeat = extractTransitionFeatures(segments);
  const dayFeat = extractDayFeatures({
    date: "2026-01-01",
    sessionFeatures: [sessionFeat],
    tasks: [{ status: "done" }, { status: "todo" }],
  });

  // Detector 1: Focus Fragmentation Detector
  // Consumes only canonical SessionFeatures & TransitionSummary
  const runFocusFragmentationDetector = (s: typeof sessionFeat, t: typeof transitionFeat) => {
    return {
      hasHighContextSwitching: s.contextSwitchesPerHour >= 2.0,
      hasDistractionLeak: s.distractionDurationSeconds > 600,
      distractionRatio: s.distractionDurationSeconds / s.durationSeconds,
      distractionTransitions: t.distractionTransitions,
    };
  };

  // Detector 2: Daily Workflow Yield Detector
  // Consumes only canonical DayFeatures
  const runDailyYieldDetector = (d: typeof dayFeat) => {
    return {
      isProductiveMajority: d.totalProductiveDurationSeconds > d.totalDistractionDurationSeconds,
      hasTasksPending: d.taskCompletionRate < 1.0,
      averageSessionMins: Math.round(d.averageSessionDurationSeconds / 60),
    };
  };

  const finding1 = runFocusFragmentationDetector(sessionFeat, transitionFeat);
  const finding2 = runDailyYieldDetector(dayFeat);

  // Both detectors succeed deterministically from canonical feature outputs:
  assert.equal(finding1.hasHighContextSwitching, true);
  assert.equal(finding1.hasDistractionLeak, true);
  assert.equal(finding1.distractionRatio, 0.25);
  assert.equal(finding1.distractionTransitions, 1);

  assert.equal(finding2.isProductiveMajority, true);
  assert.equal(finding2.hasTasksPending, true);
  assert.equal(finding2.averageSessionMins, 60);

  // Neither detector required direct parsing of raw strings, clipping timestamps, or re-running categorization.
});
