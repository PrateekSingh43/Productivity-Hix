import assert from "node:assert/strict";
import { test } from "node:test";
import { displayCopy, diagnosticLines } from "../features/analytics";

test("displayCopy rejects UUIDs", () => {
  assert.equal(displayCopy("Occasion 3f2b9c1a-7d4e-4f6a-9b2c-1e5d8a7f6b3c recorded"), "");
});

test("displayCopy rejects snake_case and D-numbers", () => {
  assert.equal(displayCopy("gap_mix for D3"), "");
  assert.equal(displayCopy("gap-mix kept internal"), "");
  assert.equal(displayCopy("primary pattern gate"), "");
  assert.equal(displayCopy("internal gate detail"), "");
  assert.equal(displayCopy("bounded evidence window"), "");
  assert.equal(displayCopy("immutable plan snapshots"), "");
  assert.equal(displayCopy("separation ratio"), "");
  assert.equal(displayCopy("detector validity"), "");
  assert.equal(displayCopy("Detectors not implemented"), "");
});

test("displayCopy accepts plain friendly copy", () => {
  assert.equal(displayCopy("Longest observed stretches were shorter than earlier records."), "Longest observed stretches were shorter than earlier records.");
  assert.equal(displayCopy("", "fallback"), "fallback");
});

test("diagnosticLines maps snapshot reasons", () => {
  assert.deepEqual(diagnosticLines({ perDetector: [{ identity: "schedule_variance", status: "INSUFFICIENT_BASELINE_DATA", reason: "Immutable plan snapshots and personal tolerance are unavailable; mutable task plans are not substituted." }] }), ["Saved plans from before work began are missing."]);
});

test("diagnosticLines maps baseline and historical reasons", () => {
  assert.deepEqual(diagnosticLines({ perDetector: [{ identity: "x", status: "INSUFFICIENT_BASELINE_DATA", reason: "Historical coverage for baseline is too thin." }] }), ["More earlier comparable work is needed for this comparison."]);
});

test("diagnosticLines maps gap-mix and separation reasons", () => {
  assert.deepEqual(diagnosticLines({ perDetector: [{ identity: "task_execution_fragmentation", status: "INSUFFICIENT_EVIDENCE", reason: "The existing pattern detector tests a separation ratio, not a qualified gap-mix change; kept internal." }] }), ["More earlier comparable work is needed for this comparison."]);
});

test("diagnosticLines maps coverage, unknown, telemetry, corroborating and activity reasons", () => {
  for (const reason of ["Unknown coverage", "Telemetry was offline", "No corroborating self-report", "No recorded activity"]) {
    assert.deepEqual(diagnosticLines({ perDetector: [{ identity: "x", status: "INSUFFICIENT_EVIDENCE", reason }] }), ["Some periods do not have enough recorded activity to compare."]);
  }
});

test("diagnosticLines maps contributor, primary, alongside reasons", () => {
  assert.deepEqual(diagnosticLines({ perDetector: [{ identity: "context_switching_density", status: "NOT_PROMOTED", reason: "Contributor role; primary claim not established; kept internal alongside others." }] }), ["Changes between software contexts are evaluated alongside other work."]);
});

test("diagnosticLines maps insufficient, occasion, distinct day, qualifying reasons", () => last(d({ reason: "Only 1 distinct day", status: "INSUFFICIENT_EVIDENCE" }), "More comparable occasions are needed."));

test("diagnosticLines maps reflection reasons", () => {
  assert.deepEqual(diagnosticLines({ perDetector: [{ identity: "x", status: "INSUFFICIENT_EVIDENCE", reason: "personal context missing" }] }), ["Related reflections or assessed outcomes are missing."]);
});

test("diagnosticLines maps not-implemented and blocked statuses", () => {
  assert.deepEqual(diagnosticLines({ perDetector: [{ identity: "x", status: "NOT_IMPLEMENTED", reason: "blocked" }] }), ["This comparison is not available yet."]);
});

test("diagnosticLines keeps clean no-finding reasons and dedupes", () => {
  assert.deepEqual(diagnosticLines({ perDetector: [
    { identity: "a", status: "NO_PATTERN", reason: "No closed task-linked sessions are available for comparison." },
    { identity: "b", status: "INSUFFICIENT_EVIDENCE", reason: "No closed task-linked sessions are available for comparison." },
  ] }), ["No closed task-linked sessions are available for comparison."]);
});

test("diagnosticLines passes through friendly success reasons", () => {
  assert.deepEqual(diagnosticLines({ perDetector: [{ identity: "a", status: "PROMOTED", reason: "Promoted." }] }), ["Promoted."]);
});

function d(item: { reason: string; status: string }) {
  return diagnosticLines({ perDetector: [{ identity: "x", ...item }] });
}
function last(lines: string[], expected: string) {
  assert.deepEqual(lines, [expected]);
}
