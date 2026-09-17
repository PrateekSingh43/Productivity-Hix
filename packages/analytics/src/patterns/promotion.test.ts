import assert from "node:assert/strict";
import { test } from "node:test";
import { configureDetectorCatalogEntry, getDetectorCatalogEntry } from "./catalog";
import { promotePattern, promotePatterns, type PatternPromotionInput } from "./promotion";
import { fixturePattern, fixtureStore, fixtureThresholds, fixtureWindow, resolveFixtureEvidence } from "./promotion.fixtures";

const entry = configureDetectorCatalogEntry("task_execution_fragmentation", fixtureThresholds);

test("promotion accepts qualified gap mix and discloses actual eligibility and lineage", () => {
  const pattern = fixturePattern();
  const before = structuredClone(pattern);
  const result = promotePattern(pattern, entry, fixtureWindow);
  assert.equal(result.promoted, true);
  if (!result.promoted) return;
  assert.deepEqual(result.pattern.eligibility.required, fixtureThresholds);
  assert.equal(result.pattern.eligibility.observed.qualifyingEpisodes, 3);
  assert.ok(resolveFixtureEvidence(result.pattern.evidenceRefs, fixtureStore()));
  assert.deepEqual(pattern, before);
});

const cases: Array<[string, (pattern: PatternPromotionInput) => void, string, string]> = [
  ["validity", (p) => { p.qualification.validity.symmetricSegmentation = false; }, "validity", "INSUFFICIENT_EVIDENCE"],
  ["occasion recurrence", (p) => { p.sample.qualifyingEpisodes = 2; }, "recurrence", "INSUFFICIENT_EVIDENCE"],
  ["distinct days", (p) => { p.sample.qualifyingDays = 2; }, "recurrence", "INSUFFICIENT_EVIDENCE"],
  ["missing context", (p) => { p.qualification.context.description = ""; }, "context", "INSUFFICIENT_EVIDENCE"],
  ["wrong context", (p) => { p.qualification.context.kind = "workstream"; }, "context", "INSUFFICIENT_EVIDENCE"],
  ["comparison note", (p) => { p.comparison.comparabilityNote = ""; }, "context", "INSUFFICIENT_EVIDENCE"],
  ["small contrast", (p) => { p.qualification.contrast.size = 0.01; }, "contrast", "INSUFFICIENT_BASELINE_DATA"],
  ["direction inconsistency", (p) => { p.qualification.contrast.direction = "decreased"; }, "contrast", "INSUFFICIENT_BASELINE_DATA"],
  ["history leakage", (p) => { p.comparison.window.end = fixtureWindow.end; }, "contrast", "INSUFFICIENT_BASELINE_DATA"],
  ["baseline occasions", (p) => { p.qualification.baselineSample.comparableOccasions = 2; }, "contrast", "INSUFFICIENT_BASELINE_DATA"],
  ["baseline days", (p) => { p.qualification.baselineSample.distinctDays = 2; }, "contrast", "INSUFFICIENT_BASELINE_DATA"],
  ["low coverage", (p) => { p.sample.meanCoverageRatio = 0.79; }, "evidence", "INSUFFICIENT_EVIDENCE"],
  ["unknown excess", (p) => { p.qualification.unknownFraction = 0.21; }, "evidence", "INSUFFICIENT_EVIDENCE"],
  ["nonfinite coverage", (p) => { p.sample.meanCoverageRatio = NaN; }, "evidence", "INSUFFICIENT_EVIDENCE"],
  ["nonfinite unknown", (p) => { p.qualification.unknownFraction = NaN; }, "evidence", "INSUFFICIENT_EVIDENCE"],
  ["empty evidence", (p) => { p.evidenceRefs = []; }, "evidence", "INSUFFICIENT_EVIDENCE"],
  ["sample inflation", (p) => { p.sample.qualifyingEpisodes = 4; }, "evidence", "INSUFFICIENT_EVIDENCE"],
  ["excluded occasion", (p) => { p.eligibility.excluded = [{ occasionId: "occasion-1", reason: "Unknown" }]; }, "evidence", "INSUFFICIENT_EVIDENCE"],
  ["no relevance", (p) => { p.qualification.userQuestion = "How productive am I?"; }, "relevance", "NOT_PROMOTED_INTERNAL_ONLY"],
  ["causal claim", (p) => { p.claim = "Other work causes late returns."; }, "validity", "NOT_PROMOTED_INTERNAL_ONLY"],
  ["ratio promotion", (p) => { p.contributingResults[0]!.metricsUsed = ["wallClockFragmentationRatio"]; }, "catalog", "NOT_PROMOTED_INTERNAL_ONLY"],
  ["no gap categories", (p) => { p.qualification.gapCategories = []; }, "catalog", "NOT_PROMOTED_INTERNAL_ONLY"],
  ["unregistered contributor", (p) => { p.contributingResults[0]!.detectorIdentity = "unregistered"; }, "catalog", "NOT_PROMOTED_INTERNAL_ONLY"],
];

for (const [name, mutate, criterion, status] of cases) {
  test(`promotion rejects ${name}`, () => {
    const pattern = fixturePattern();
    mutate(pattern);
    const result = promotePattern(pattern, entry, fixtureWindow);
    assert.equal(result.promoted, false);
    if (result.promoted) return;
    assert.equal(result.reason.criterion, criterion);
    assert.equal(result.reason.status, status);
  });
}

test("threshold boundaries pass and stricter catalog config rejects the same sample", () => {
  const pattern = fixturePattern();
  pattern.sample.meanCoverageRatio = fixtureThresholds.minimumCoverageRatio;
  pattern.qualification.unknownFraction = fixtureThresholds.maximumUnknownFraction;
  pattern.qualification.contrast.size = fixtureThresholds.minimumAbsoluteContrast;
  assert.equal(promotePattern(pattern, entry, fixtureWindow).promoted, true);
  const strict = configureDetectorCatalogEntry(entry.identity, { ...fixtureThresholds, minimumComparableOccasions: 4 });
  assert.equal(promotePattern(pattern, strict, fixtureWindow).promoted, false);
});

test("D1 research context changes stay contributor-only; blocked and anomaly detectors never promote", () => {
  for (const identity of ["context_switching_density", "start_friction", "quiet_work_recurrence", "stability_shift"] as const) {
    const result = promotePattern(fixturePattern(identity), configureDetectorCatalogEntry(identity, fixtureThresholds), fixtureWindow);
    assert.equal(result.promoted, false);
    if (!result.promoted) assert.equal(result.reason.status, "NOT_PROMOTED_INTERNAL_ONLY");
  }
});

test("catalog cannot be spoofed into permitting D1 primary", () => {
  const pattern = { ...fixturePattern("context_switching_density"), role: "primary" } as PatternPromotionInput;
  const spoofed = { ...configureDetectorCatalogEntry("context_switching_density", fixtureThresholds), eligiblePatternRoles: ["primary" as const] };
  assert.equal(promotePattern(pattern, spoofed, fixtureWindow).promoted, false);
  assert.equal(promotePattern(fixturePattern(), getDetectorCatalogEntry(entry.identity), fixtureWindow).promoted, false);
});

test("D4 intention comparison needs no historical baseline but still requires repeated occasions", () => {
  const pattern = fixturePattern("schedule_variance");
  pattern.qualification.baselineSample = { comparableOccasions: 0, distinctDays: 0 };
  pattern.baseline.comparisonStatus = "NOT_APPLICABLE";
  assert.equal(promotePattern(pattern, configureDetectorCatalogEntry("schedule_variance", fixtureThresholds), fixtureWindow).promoted, true);
});

test("D3 strength requires assessed outcomes, changed does not", () => {
  const pattern = fixturePattern("extended_continuous_activity");
  const configured = configureDetectorCatalogEntry("extended_continuous_activity", fixtureThresholds);
  assert.equal(promotePattern(pattern, configured, fixtureWindow).promoted, true);
  pattern.repertoireCategory = "strength";
  assert.equal(promotePattern(pattern, configured, fixtureWindow).promoted, false);
  pattern.qualification.assessedOutcomeRecordIds = ["outcome-1"];
  pattern.evidenceRefs[0]!.reportIds.push("outcome-1");
  assert.equal(promotePattern(pattern, configured, fixtureWindow).promoted, true);
});

test("duplicate evidence unions IDs without inflating occasion counts", () => {
  const pattern = fixturePattern();
  pattern.evidenceRefs.push(structuredClone(pattern.evidenceRefs[0]!));
  const result = promotePattern(pattern, entry, fixtureWindow);
  assert.ok(result.promoted);
  assert.equal(result.pattern.evidenceRefs.length, 3);
  assert.deepEqual(result.pattern.evidenceRefs[0]!.blockIds, ["block-1"]);
});

test("lineage fixture resolver rejects dangling IDs of every kind", () => {
  for (const field of ["blockIds", "sessionIds", "taskIds", "reportIds"] as const) {
    const pattern = fixturePattern();
    pattern.evidenceRefs[0]![field].push("dangling");
    assert.equal(resolveFixtureEvidence(pattern.evidenceRefs, fixtureStore()), false);
  }
});

test("promotion sorts before seen-set dedupe and is invariant to shuffle", () => {
  const a = fixturePattern(entry.identity, "a");
  const b = fixturePattern(entry.identity, "b");
  const forward = promotePatterns([a, b], [entry], fixtureWindow);
  const reverse = promotePatterns([b, a], [entry], fixtureWindow);
  assert.deepEqual(forward, reverse);
  assert.equal(forward[0]?.promoted, true);
  assert.equal(forward[1]?.promoted, false);
  const seen = new Set<string>();
  assert.equal(promotePattern(a, entry, fixtureWindow, seen).promoted, true);
  assert.equal(promotePattern(b, entry, fixtureWindow, seen).promoted, false);
  assert.deepEqual(promotePatterns([], [entry], fixtureWindow), []);
});
