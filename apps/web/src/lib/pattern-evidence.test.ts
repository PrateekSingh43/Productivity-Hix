import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evidenceFootprintDates,
  evidenceTotals,
  limitationLines,
  observedCounts,
  patternKindLabel,
  referenceKindLine,
} from "../features/analytics/lib/evidence-summary";

test("evidenceTotals takes max across available detectors, skips the rest", () => {
  assert.deepEqual(
    evidenceTotals({
      perDetector: [
        { identity: "a", status: "x", availability: "AVAILABLE", eligibleOccasions: 7, eligibleDays: 6 },
        { identity: "b", status: "x", availability: "AVAILABLE", eligibleOccasions: 4, eligibleDays: 4 },
        { identity: "c", status: "x", availability: "NOT_AVAILABLE", eligibleOccasions: 99, eligibleDays: 99 },
        { identity: "d", status: "x", availability: "AVAILABLE", eligibleOccasions: 0, eligibleDays: 0 },
      ],
    }),
    { occasions: 7, days: 6 }
  );
});

test("evidenceTotals returns null when nothing observed", () => {
  assert.equal(evidenceTotals({ perDetector: [] }), null);
  assert.equal(evidenceTotals(undefined), null);
  assert.equal(
    evidenceTotals({ perDetector: [{ identity: "a", status: "x", eligibleOccasions: 0, eligibleDays: 0 }] }),
    null
  );
});

test("observedCounts reads observed side only", () => {
  assert.deepEqual(
    observedCounts({ required: { minimumComparableOccasions: 5 }, observed: { qualifyingEpisodes: 4, qualifyingDays: 4 }, excluded: [] }),
    { occasions: 4, days: 4 }
  );
  assert.equal(observedCounts(undefined), null);
  assert.equal(observedCounts({ required: {}, observed: {}, excluded: [] }), null);
});

test("evidenceFootprintDates dedupes, sorts, drops invalid", () => {
  const refs = [
    { occasionId: "2", date: "2026-09-27T10:00:00.000Z", window: { start: "", end: "" }, blockIds: [], sessionIds: [], taskIds: [], reportIds: [] },
    { occasionId: "1", date: "2026-09-21", window: { start: "", end: "" }, blockIds: [], sessionIds: [], taskIds: [], reportIds: [] },
    { occasionId: "3", date: "2026-09-27T15:00:00.000Z", window: { start: "", end: "" }, blockIds: [], sessionIds: [], taskIds: [], reportIds: [] },
    { occasionId: "4", date: "not-a-date", window: { start: "", end: "" }, blockIds: [], sessionIds: [], taskIds: [], reportIds: [] },
  ];
  assert.deepEqual(evidenceFootprintDates(refs), ["2026-09-21", "2026-09-27"]);
  assert.deepEqual(evidenceFootprintDates([]), []);
  assert.deepEqual(evidenceFootprintDates(null), []);
});

test("limitationLines caps output", () => {
  const lines = limitationLines(
    { perDetector: ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({ identity: id, status: "INSUFFICIENT_EVIDENCE", reason: `reason ${id}` })) },
    3
  );
  assert.equal(lines.length <= 3, true);
});

test("referenceKindLine maps known kinds, null otherwise", () => {
  assert.equal(referenceKindLine("declared-intention"), "Compared with your declared plans");
  assert.equal(referenceKindLine("own-history"), "Compared with your earlier recorded work");
  assert.equal(referenceKindLine("mystery"), null);
  assert.equal(referenceKindLine(undefined), null);
});

test("patternKindLabel maps claim levels plainly", () => {
  assert.equal(patternKindLabel("recurrence"), "Recurring behavior");
  assert.equal(patternKindLabel("sustained-change"), "Sustained change");
  assert.equal(patternKindLabel("co-occurrence"), "Seen together");
  assert.equal(patternKindLabel("unknown"), "Recurring behavior");
});
