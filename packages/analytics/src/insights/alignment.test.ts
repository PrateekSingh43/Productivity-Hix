import { describe, expect, test } from "vitest";
import { composeInsight, type OutcomeInput, type ReflectionInput } from "./index";
import { fixturePattern, fixtureWindow } from "../patterns/promotion.fixtures";

/**
 * Task 6: reflections/outcomes wired into insight composition.
 *
 * Alignment = shared context key AND overlapping occasion window AND
 * (focus rating present OR assessed goal outcome present). Absent
 * reflections/outcomes mean unaligned, which means no insight — never
 * an invented reflection or outcome.
 */

const OCCASION_WINDOW = { start: "2026-09-01T10:15:00Z", end: "2026-09-01T10:45:00Z" };

function alignedComposition() {
  const pattern = fixturePattern("schedule_variance");
  pattern.evidenceRefs[0]!.reportIds = ["outcome-1"];
  return {
    window: fixtureWindow,
    patterns: [{ pattern }],
    reflections: [
      {
        recordId: "reflection-1",
        date: "2026-09-01",
        reportedFocus: "scattered",
        contextKey: "task-1",
        window: { ...OCCASION_WINDOW },
      },
    ] as ReflectionInput[],
    outcomes: [
      {
        recordId: "outcome-1",
        goalOutcome: "NOT_ACHIEVED" as const,
        date: "2026-09-01",
        contextKey: "task-1",
        window: { ...OCCASION_WINDOW },
      },
    ] as OutcomeInput[],
  };
}

describe("reflection/outcome alignment (Task 6)", () => {
  test("aligned low focus plus assessed outcome yields a detected insight with personal elements", () => {
    const output = composeInsight(alignedComposition());
    expect(output.status).toBe("DETECTED");
    expect(output.personalElements).toEqual([
      { kind: "reflection", recordId: "reflection-1" },
      { kind: "outcome", recordId: "outcome-1" },
    ]);
    expect(output.claimLevel).toBe("pattern-outcome-association");
  });

  test("same pattern with no reflections or outcomes yields no insight", () => {
    const pattern = fixturePattern("schedule_variance");
    const output = composeInsight({ window: fixtureWindow, patterns: [{ pattern }] });
    expect(output.status).toBe("NO_INSIGHT");
    expect(output.personalElements).toEqual([]);
  });

  test("reflection under a different context key does not align", () => {
    const input = alignedComposition();
    input.reflections = [
      { ...input.reflections[0]!, contextKey: "unrelated-task" },
    ];
    input.outcomes = [];
    const output = composeInsight({ ...input, patterns: [{ pattern: fixturePattern("task_execution_fragmentation") }] });
    expect(output.status).toBe("NO_INSIGHT");
  });

  test("reflection window outside the occasion windows does not align", () => {
    const input = alignedComposition();
    input.reflections = [
      { ...input.reflections[0]!, window: { start: "2026-09-01T14:00:00Z", end: "2026-09-01T15:00:00Z" } },
    ];
    input.outcomes = [];
    const output = composeInsight({ ...input, patterns: [{ pattern: fixturePattern("task_execution_fragmentation") }] });
    expect(output.status).toBe("NO_INSIGHT");
  });

  test("context and window without any reported content do not align", () => {
    const input = alignedComposition();
    input.reflections = [
      {
        recordId: "reflection-1",
        date: "2026-09-01",
        contextKey: "task-1",
        window: { ...OCCASION_WINDOW },
      },
    ];
    input.outcomes = [];
    const output = composeInsight({ ...input, patterns: [{ pattern: fixturePattern("task_execution_fragmentation") }] });
    expect(output.status).toBe("NO_INSIGHT");
  });
});
