import { test } from "node:test";
import assert from "node:assert/strict";
import { CheckInScheduler } from "./background/scheduler";
import { CheckInQueue } from "./background/checkin-queue";

const memoryStorage: Record<string, unknown> = {};
(globalThis as any).chrome = {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: memoryStorage[key] }),
      set: async (items: Record<string, unknown>) => {
        Object.assign(memoryStorage, items);
      },
      remove: async (key: string) => {
        delete memoryStorage[key];
      },
    },
  },
  notifications: {
    create: async () => "test-notif-id",
    clear: async () => true,
    onClicked: { addListener: () => {} },
  },
};

test("CheckInScheduler tracks active seconds and respects fast seconds-based dev cadence", async () => {
  const scheduler = new CheckInScheduler();
  await scheduler.updateConfig({ devMode: true, devIntervalSeconds: 30, checkInsPaused: false });

  // Initially zero active seconds -> not eligible
  let eligibility = await scheduler.evaluateEligibility();
  assert.equal(eligibility.eligible, false);

  // Record 35 active seconds (exceeds 30 second threshold)
  await scheduler.recordActivity("github.com", 35 * 1000);

  eligibility = await scheduler.evaluateEligibility();
  assert.equal(eligibility.eligible, true);
  assert.ok(eligibility.reason.includes("threshold reached"));
});

test("CheckInScheduler enforces quiet hours, cooldown, and paused states", async () => {
  const scheduler = new CheckInScheduler();
  await scheduler.updateConfig({ devMode: true, devIntervalSeconds: 30, checkInsPaused: true });

  // Paused -> never eligible
  let eligibility = await scheduler.evaluateEligibility();
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "Check-ins are paused by user");

  // Quiet hours / Sleep schedule active (00:00 to 23:59 covers all day)
  await scheduler.updateConfig({ checkInsPaused: false, sleepScheduleEnabled: true, sleepStart: "00:00", sleepEnd: "23:59" });
  eligibility = await scheduler.evaluateEligibility();
  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.reason.includes("Quiet hours") || eligibility.reason.includes("Sleep schedule"));

  // Disable sleep schedule, record check-in completed -> triggers cooldown
  await scheduler.updateConfig({ sleepScheduleEnabled: false });
  await scheduler.recordCheckInCompleted();

  const state = await scheduler.getState();
  assert.ok(state.checkInCooldownUntil);
  assert.equal(state.checkInsCompletedCount, 1);

  // In cooldown -> not eligible
  eligibility = await scheduler.evaluateEligibility();
  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.reason.includes("cooldown"));
});

test("CheckInQueue enqueues offline payloads and retrieves them", async () => {
  const queue = new CheckInQueue();
  await queue.enqueue({
    activityAssessment: "deep_focus",
    alignment: "yes",
    reasons: [],
    state: "motivated",
    energy: "high",
    focus: "focused",
    note: "Offline focus block",
    questionVersion: "v1",
    source: "extension",
    eventType: "PERIODIC",
  });

  const queued = await queue.getQueue();
  assert.equal(queued.length, 1);
  assert.equal(queued[0].payload.activityAssessment, "deep_focus");
  assert.equal(queued[0].payload.note, "Offline focus block");

  await queue.remove(queued[0].clientQueueId);
  const remaining = await queue.getQueue();
  assert.equal(remaining.length, 0);
});
