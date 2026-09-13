import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInCreateSchema } from "./check-in";

test("checkInCreateSchema validates structured check-in", () => {
  const valid = {
    activityAssessment: "productive",
    alignment: "yes",
    reasons: [],
    state: "motivated",
    energy: "high",
    focus: "focused",
    note: "Made solid progress on the check-in data pipeline.",
    questionVersion: "v1",
    source: "extension_hourly",
  };

  const parsed = checkInCreateSchema.parse(valid);
  assert.equal(parsed.activityAssessment, "productive");
  assert.equal(parsed.alignment, "yes");
  assert.equal(parsed.energy, "high");
  assert.equal(parsed.focus, "focused");
  assert.equal(parsed.note, "Made solid progress on the check-in data pipeline.");
  assert.deepEqual(parsed.reasons, []);
});

test("checkInCreateSchema strictly enforces 500 character limit on note, outcome, intent, and blocker", () => {
  const str500 = "a".repeat(500);
  assert.doesNotThrow(() => {
    checkInCreateSchema.parse({ note: str500, outcome: str500, intent: str500, blocker: str500 });
  });

  const str501 = "a".repeat(501);
  assert.throws(() => {
    checkInCreateSchema.parse({ note: str501 });
  });
  assert.throws(() => {
    checkInCreateSchema.parse({ outcome: str501 });
  });
  assert.throws(() => {
    checkInCreateSchema.parse({ intent: str501 });
  });
  assert.throws(() => {
    checkInCreateSchema.parse({ blocker: str501 });
  });

  // Emotional states including sleepy and angry
  assert.doesNotThrow(() => {
    checkInCreateSchema.parse({ state: "sleepy" });
    checkInCreateSchema.parse({ state: "angry" });
  });
});

test("checkInCreateSchema handles adaptive blocker reasons and deeper answers", () => {
  const input = {
    activityAssessment: "distracted",
    alignment: "no",
    reasons: ["low_motivation", "didnt_feel_like_it"],
    state: "frustrated",
    energy: "low",
    focus: "scattered",
    note: "Hard to start.",
    deeperAnswers: {
      q_starting_difficulty: "task_felt_too_large",
    },
  };

  const parsed = checkInCreateSchema.parse(input);
  assert.equal(parsed.reasons.length, 2);
  assert.equal(parsed.deeperAnswers?.q_starting_difficulty, "task_felt_too_large");
  assert.equal(parsed.questionVersion, "v1");
});
