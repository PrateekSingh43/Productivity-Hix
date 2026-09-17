import assert from "node:assert/strict";
import { test } from "node:test";
import { configureDetectorCatalogEntry, detectorCatalog, getDetectorCatalogEntry, isDetectorIdentity, patternRelationship, type CatalogPatternIdentity } from "./catalog";
import { generateGapMixCopy, generatePatternCopy } from "./copy";
import { fixtureThresholds } from "./promotion.fixtures";

test("catalog retains seven distinct semantic dispositions", () => {
  assert.equal(Object.keys(detectorCatalog).length, 7);
  assert.deepEqual(detectorCatalog.context_switching_density.eligiblePatternRoles, ["contributor"]);
  assert.equal(detectorCatalog.start_friction.availability, "blocked-not-implemented");
  assert.equal(detectorCatalog.quiet_work_recurrence.availability, "not-implemented");
  assert.equal(detectorCatalog.stability_shift.availability, "insight-material-only");
  assert.ok(detectorCatalog.extended_continuous_activity.eligiblePatternRoles.includes("primary"));
  assert.ok(detectorCatalog.schedule_variance.eligiblePatternRoles.includes("primary"));
});

test("identity-role contract excludes D1 primary and blocked detectors", () => {
  type D1Primary = Extract<CatalogPatternIdentity, { detectorIdentity: "context_switching_density" }> extends { role: "primary" } ? true : false;
  const primaryAllowed: D1Primary = false;
  assert.equal(primaryAllowed, false);
  assert.equal(isDetectorIdentity("invented"), false);
  assert.equal(isDetectorIdentity("toString"), false);
});

test("thresholds are explicitly configured, copied and validated without invented defaults", () => {
  assert.equal(getDetectorCatalogEntry("schedule_variance").eligibility.thresholds, null);
  const configured = configureDetectorCatalogEntry("schedule_variance", fixtureThresholds);
  assert.deepEqual(configured.eligibility.thresholds, fixtureThresholds);
  assert.notEqual(configured.eligibility.thresholds, fixtureThresholds);
  for (const invalid of [NaN, Infinity, -1, 0, 1, 1.5]) {
    assert.throws(() => configureDetectorCatalogEntry("schedule_variance", { ...fixtureThresholds, minimumComparableOccasions: invalid }));
  }
});

test("only blueprint pairings are whitelisted, in either input order", () => {
  assert.equal(patternRelationship(["context_switching_density", "task_execution_fragmentation"]), "co-occurrence");
  assert.equal(patternRelationship(["task_execution_fragmentation", "schedule_variance"]), "context");
  assert.equal(patternRelationship(["extended_continuous_activity", "quiet_work_recurrence"]), "constitutive");
  assert.equal(patternRelationship(["context_switching_density", "schedule_variance"]), undefined);
  assert.equal(patternRelationship(["schedule_variance", "start_friction"]), undefined);
  assert.equal(patternRelationship(["stability_shift", "task_execution_fragmentation"]), undefined);
});

test("legitimate decomposition, breaks and explained gaps remain neutral", () => {
  for (const category of ["other_task", "break", "explained"] as const) {
    const copy = generateGapMixCopy([category]);
    assert.doesNotMatch(`${copy.headline} ${copy.supportingLine}`, /fragmented|fractured|problem|fragmentation/i);
  }
  assert.deepEqual(generateGapMixCopy(["break", "other_task", "break"]), generateGapMixCopy(["other_task", "break"]));
});

test("copy uses plain situations, not statistical or trait labels", () => {
  for (const detectorIdentity of ["schedule_variance", "extended_continuous_activity", "task_execution_fragmentation"] as const) {
    const copy = generatePatternCopy({ detectorIdentity, claimLevel: "sustained-change", direction: "increased", gapCategories: ["explained"] });
    assert.doesNotMatch(copy.headline, /switching|fragmentation|variance|coverage|score|baseline|recurrence|elevated|degraded|habit|fatigue|discipline/i);
    assert.match(copy.supportingLine, /recorded|observed|corroborated/i);
  }
});
