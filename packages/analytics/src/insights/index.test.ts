import assert from "node:assert/strict";
import { test } from "node:test";
import { composeInsight, composeInsights, isNonCausalClaim, type InsightCompositionInput, type ObservationInput } from "./index";
import { fixtureEvidence, fixturePattern, fixtureReliability, fixtureStore, fixtureWindow, resolveFixtureEvidence } from "../patterns/promotion.fixtures";

function composition(): InsightCompositionInput {
  return {
    window: fixtureWindow,
    patterns: [{ pattern: fixturePattern() }],
    reflections: [{ recordId: "reflection-1", date: "2026-09-01", reportedEnergy: "low", reportedProgress: false }],
  };
}

function observation(): ObservationInput {
  return {
    kind: "within-day-anomaly", date: "2026-09-01", summary: "Later recorded work stretches were shorter.",
    observationRef: "observation-1", window: fixtureEvidence()[0]!.window,
    evidenceRefs: [fixtureEvidence()[0]!], reliability: fixtureReliability,
    validity: { qualified: true, coverageSufficient: true }, metrics: { sessionCount: 3 },
  };
}

test("pattern with same-period reflection yields a traceable contrast", () => {
  const output = composeInsight(composition());
  assert.equal(output.status, "DETECTED");
  assert.equal(output.claimLevel, "contrast");
  assert.deepEqual(output.personalElements, [{ kind: "reflection", recordId: "reflection-1" }]);
  assert.ok(resolveFixtureEvidence(output.evidenceRefs, fixtureStore()));
  assert.match(output.claim, /reported low energy and no progress/);
  assert.equal(output.reliability?.tier, "PROVISIONAL");
  assert.equal(output.hypothesis, undefined);
});

test("one pattern alone is not an insight and no records is an honest empty state", () => {
  assert.equal(composeInsight({ window: fixtureWindow, patterns: [{ pattern: fixturePattern() }] }).status, "NO_INSIGHT");
  const empty = composeInsight({ window: fixtureWindow });
  assert.equal(empty.status, "NO_INSIGHT");
  assert.equal(empty.reliability, null);
  assert.deepEqual(empty.evidenceRefs, []);
  assert.deepEqual(composeInsights([]), []);
});

test("missing reflection answers stay unknown rather than defaulting to low energy", () => {
  const input = composition();
  input.reflections = [{ recordId: "reflection-1", date: "2026-09-01" }];
  assert.equal(composeInsight(input).status, "NO_INSIGHT");
});

test("every contradictory same-period reflection remains in alternatives and lineage", () => {
  const input = composition();
  input.reflections = [...input.reflections!, { recordId: "reflection-2", date: "2026-09-02", reportedEnergy: "high", reportedProgress: true }];
  const output = composeInsight(input);
  assert.equal(output.personalElements.length, 2);
  assert.ok(output.alternatives.some((alternative) => alternative.includes("reflection-1")));
  assert.ok(output.alternatives.some((alternative) => alternative.includes("reflection-2") && alternative.includes("high energy")));
  assert.ok(output.alternatives.some((alternative) => alternative.includes("do not support one uniform account")));
  assert.ok(resolveFixtureEvidence(output.evidenceRefs, fixtureStore()));
});

test("reflection outside the evidence dates cannot supply personal context", () => {
  const input = composition();
  input.reflections = [{ recordId: "reflection-1", date: "2026-08-01", reportedEnergy: "low" }];
  assert.equal(composeInsight(input).status, "NO_INSIGHT");
});

test("D4 and independently assessed goal outcomes yield association, never task-completion inference", () => {
  const pattern = fixturePattern("schedule_variance");
  pattern.evidenceRefs[0]!.reportIds = ["outcome-1"];
  const output = composeInsight({
    window: fixtureWindow, patterns: [{ pattern }],
    outcomes: [{ recordId: "outcome-1", taskId: "task-1", goalOutcome: "ACHIEVED" }],
  });
  assert.equal(output.status, "DETECTED");
  assert.equal(output.claimLevel, "pattern-outcome-association");
  assert.match(output.claim, /1 achieved, 0 partly achieved and 0 not achieved/);
  assert.ok(output.doesNotEstablish.some((line) => /Task completion/.test(line)));
  assert.ok(resolveFixtureEvidence(output.evidenceRefs, fixtureStore()));
});

test("unassessed, unlinked, wrong-task and disallowed pattern-outcome pairs cannot compose", () => {
  for (const variant of ["unassessed", "unlinked", "wrong-task", "wrong-date", "disallowed"] as const) {
    const pattern = fixturePattern(variant === "disallowed" ? "task_execution_fragmentation" : "schedule_variance");
    if (variant !== "unlinked") pattern.evidenceRefs[0]!.reportIds = ["outcome-1"];
    const output = composeInsight({ window: fixtureWindow, patterns: [{ pattern }], outcomes: [{
      recordId: "outcome-1", goalOutcome: variant === "unassessed" ? "NOT_ASSESSED" : "ACHIEVED",
      taskId: variant === "wrong-task" ? "unrelated" : "task-1", date: variant === "wrong-date" ? "2026-09-02" : undefined,
    }] });
    assert.equal(output.status, "NO_INSIGHT", variant);
  }
});

test("bounded observation plus same-day reflection is an anomaly insight, not a pattern", () => {
  const output = composeInsight({ window: fixtureWindow, observation: observation(), reflections: composition().reflections });
  assert.equal(output.status, "DETECTED");
  assert.equal(output.claimLevel, "co-occurrence");
  assert.deepEqual(output.inputs, [{ observationRef: "observation-1", role: "primary" }]);
  assert.match(output.claim, /not a recurring pattern/);
  assert.ok(resolveFixtureEvidence(output.evidenceRefs, fixtureStore()));
});

test("anomaly needs same-day reflection and qualified coverage", () => {
  const differentDay = composeInsight({ window: fixtureWindow, observation: observation(), reflections: [
    { recordId: "reflection-2", date: "2026-09-02", reportedEnergy: "low" },
  ] });
  assert.equal(differentDay.status, "NO_INSIGHT");
  const invalid = observation();
  invalid.validity.coverageSufficient = false;
  assert.equal(composeInsight({ window: fixtureWindow, observation: invalid, reflections: composition().reflections }).status, "INSUFFICIENT_EVIDENCE");
});

test("whitelisted D1×D2 co-occurrence and D2×D4 context accept personal elements", () => {
  for (const identity of ["context_switching_density", "schedule_variance"] as const) {
    const input = composition();
    input.patterns = [...input.patterns!, { pattern: fixturePattern(identity, "result-2") }];
    const output = composeInsight(input);
    assert.equal(output.status, "DETECTED");
    assert.equal(output.inputs.length, 2);
    assert.equal(output.evidenceRefs.length, 3);
    assert.ok(isNonCausalClaim(output.claim));
  }
});

test("pairs without personal context, unlisted pairs and D6-not-implemented are withheld", () => {
  const pairs = [
    ["context_switching_density", "schedule_variance"],
    ["extended_continuous_activity", "quiet_work_recurrence"],
  ] as const;
  for (const [a, b] of pairs) {
    assert.notEqual(composeInsight({ window: fixtureWindow, patterns: [
      { pattern: fixturePattern(a, "a") }, { pattern: fixturePattern(b, "b") },
    ], reflections: composition().reflections }).status, "DETECTED");
  }
  assert.equal(composeInsight({ window: fixtureWindow, patterns: [
    { pattern: fixturePattern("context_switching_density", "a") }, { pattern: fixturePattern("task_execution_fragmentation", "b") },
  ] }).status, "NO_INSIGHT");
});

test("different users, unaligned windows and insufficient pattern evidence are rejected", () => {
  for (const variant of ["user", "window", "evidence"] as const) {
    const a = fixturePattern();
    const b = fixturePattern("schedule_variance", "b");
    if (variant === "user") b.userId = "someone-else";
    if (variant === "window") b.temporalWindow.end = "2026-09-14T00:00:00Z";
    if (variant === "evidence") b.evidenceRefs = [];
    assert.equal(composeInsight({ window: fixtureWindow, patterns: [{ pattern: a }, { pattern: b }], reflections: composition().reflections }).status, "INSUFFICIENT_EVIDENCE");
  }
});

for (const claim of ["Switching causes delay", "Breaks cause delays", "Delay because of breaks", "This leads to delay", "This lead to delay", "Delay due to breaks", "This results in delay", "This result in delay", "Delay because work changed"]) {
  test(`anti-overclaim rejects: ${claim}`, () => {
    assert.equal(isNonCausalClaim(claim), false);
    const input = composition();
    input.patterns![0]!.pattern.claim = claim;
    assert.notEqual(composeInsight(input).status, "DETECTED");
  });
}

test("templates never inject blocker text or observation summaries into claims", () => {
  const bounded = observation();
  bounded.summary = "This causes fatigue because of your bad habits.";
  const output = composeInsight({ window: fixtureWindow, observation: bounded, reflections: [{
    recordId: "reflection-1", date: "2026-09-01", blockers: ["Work causes failure"],
  }] });
  assert.equal(output.status, "DETECTED");
  assert.ok(isNonCausalClaim(output.claim));
  assert.doesNotMatch(output.claim, /fatigue|habits|failure/);
});

test("determinism: shuffled patterns, reflections, compositions and duplicated evidence yield the same output", () => {
  const input = composition();
  input.patterns = [...input.patterns!, { pattern: fixturePattern("schedule_variance", "b") }];
  input.reflections = [...input.reflections!, { recordId: "reflection-2", date: "2026-09-02", reportedEnergy: "high" }];
  const reversed = structuredClone(input);
  reversed.patterns = [...reversed.patterns!].reverse();
  reversed.reflections = [...reversed.reflections!].reverse();
  reversed.patterns[0]!.pattern.evidenceRefs.reverse();
  reversed.patterns[0]!.pattern.evidenceRefs.push(structuredClone(reversed.patterns[0]!.pattern.evidenceRefs[0]!));
  assert.deepEqual(composeInsight(input), composeInsight(reversed));
  const anomaly = { window: fixtureWindow, observation: observation(), reflections: composition().reflections };
  assert.deepEqual(composeInsights([input, anomaly]), composeInsights([anomaly, reversed]));
  assert.equal(composeInsights([input, input]).length, 1);
});

test("duplicate personal records do not inflate evidence; conflicting duplicate records fail closed", () => {
  const input = composition();
  input.reflections = [...input.reflections!, ...input.reflections!];
  assert.equal(composeInsight(input).personalElements.length, 1);
  input.reflections = [...input.reflections, { ...input.reflections[0]!, reportedEnergy: "high" }];
  assert.equal(composeInsight(input).status, "INSUFFICIENT_EVIDENCE");
});
