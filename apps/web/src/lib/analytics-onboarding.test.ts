import assert from "node:assert/strict";
import { test } from "node:test";
import { MINIMUM_DAYS_FOR_FINDINGS, onboardingMessage } from "../features/analytics/components/analytics-evidence";

test("onboarding at 14 recorded days keeps building message", () => {
  const message = onboardingMessage({ firstObservationAt: "2026-09-03T09:00:00Z", lastObservationAt: "2026-09-17T09:00:00Z", recordedDays: 14, connected: true });
  assert.ok(message);
  assert.equal(message.title, "Building your first findings");
  assert.ok(!/\b14\b/.test(message.detail));
});

test("onboarding at 2 recorded days reports progress", () => {
  const message = onboardingMessage({ firstObservationAt: "2026-09-15T09:00:00Z", lastObservationAt: "2026-09-17T09:00:00Z", recordedDays: 2, connected: true });
  assert.ok(message);
  assert.match(message.detail, /\b2 of about 7 days recorded\b/);
});

test("onboarding threshold is seven days", () => {
  assert.equal(MINIMUM_DAYS_FOR_FINDINGS, 7);
});
