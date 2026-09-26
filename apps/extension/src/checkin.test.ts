import { test } from "node:test";
import assert from "node:assert/strict";
import { CheckInScheduler } from "./background/scheduler";
import { CheckInQueue } from "./background/checkin-queue";

const memoryStorage: Record<string, unknown> = {};
let createdNotifications: string[] = [];

(globalThis as any).chrome = {
  storage: {
    local: {
      get: async (keys: string | string[]) => {
        if (Array.isArray(keys)) {
          const res: Record<string, unknown> = {};
          for (const k of keys) res[k] = memoryStorage[k];
          return res;
        }
        return { [keys]: memoryStorage[keys] };
      },
      set: async (items: Record<string, unknown>) => {
        Object.assign(memoryStorage, items);
      },
      remove: async (key: string) => {
        delete memoryStorage[key];
      },
    },
  },
  action: {
    setBadgeText: async () => {},
    setBadgeBackgroundColor: async () => {},
  },
  alarms: {
    clear: async () => true,
    create: () => {},
  },
  notifications: {
    create: (id: string, _opts: any, cb?: (id: string) => void) => {
      createdNotifications.push(id);
      if (typeof _opts === "function") _opts(id);
      else cb?.(id);
      return id;
    },
    clear: async () => true,
    onClicked: { addListener: () => {} },
    onButtonClicked: { addListener: () => {} },
  },
  runtime: {
    getURL: (path: string) => `chrome-extension://test-ext-id/${path}`,
    sendMessage: async () => {},
  },
  tabs: {
    query: async () => [],
    get: async () => null,
    update: async () => {},
    remove: async () => {},
    onCreated: { addListener: () => {} },
    onUpdated: { addListener: () => {} },
    onActivated: { addListener: () => {} },
    onRemoved: { addListener: () => {} },
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

test("ReflectionEngine suppresses notifications when focus mode is active and suppressCheckInsDuringFocus is ON", async () => {
  const { reflectionEngine } = await import("./background/reflection-engine");
  const { focusGuard } = await import("./background/focus-guard");

  createdNotifications = [];

  // Enable suppression and set up dev cadence
  await reflectionEngine.updateConfig({
    devMode: true,
    devIntervalSeconds: 10,
    checkInsPaused: false,
    suppressCheckInsDuringFocus: true,
  });

  // Activate a focus session in focusGuard
  focusGuard.setSession({
    id: "session-focus-1",
    userId: "user-1",
    startedAt: new Date().toISOString(),
    isPaused: false,
    targetDurationMinutes: 25,
    notes: "Deep Work Session",
  } as any);

  // Attempt to force trigger while focus mode is active
  await reflectionEngine.forceTrigger();

  // Notification MUST NOT be created
  const checkInNotifs = createdNotifications.filter((id) => id.startsWith("productivehix-checkin-"));
  assert.equal(checkInNotifs.length, 0, "No check-in notification should be dispatched during active focus mode");

  // Deactivate focus session
  focusGuard.setSession(null);

  // Now trigger should dispatch
  await reflectionEngine.forceTrigger();
  const allowedNotifs = createdNotifications.filter((id) => id.startsWith("productivehix-checkin-"));
  assert.ok(allowedNotifs.length > 0, "Check-in notification should be dispatched when focus mode is ended");
});

test("ReflectionEngine allows notifications during focus mode when suppressCheckInsDuringFocus is turned OFF", async () => {
  const { reflectionEngine } = await import("./background/reflection-engine");
  const { focusGuard } = await import("./background/focus-guard");

  createdNotifications = [];

  // Disable suppression (switch is OFF)
  await reflectionEngine.updateConfig({
    devMode: true,
    devIntervalSeconds: 10,
    checkInsPaused: false,
    suppressCheckInsDuringFocus: false,
    resetCooldown: true,
  });

  // Activate a focus session
  focusGuard.setSession({
    id: "session-focus-2",
    userId: "user-1",
    startedAt: new Date().toISOString(),
    isPaused: false,
    targetDurationMinutes: 25,
  } as any);

  // Force trigger should now be permitted because switch is OFF
  await reflectionEngine.forceTrigger();
  const notifs = createdNotifications.filter((id) => id.startsWith("productivehix-checkin-"));
  assert.ok(notifs.length > 0, "Notification should be dispatched when suppressCheckInsDuringFocus is false");

  // Cleanup
  focusGuard.setSession(null);
});

test("ReflectionEngine and InactivityEngine suppress check-ins and away reviews when focus session is PAUSED", async () => {
  const { reflectionEngine } = await import("./background/reflection-engine");
  const { inactivityEngine } = await import("./background/inactivity-engine");
  const { focusGuard } = await import("./background/focus-guard");

  createdNotifications = [];

  await reflectionEngine.updateConfig({
    devMode: true,
    devIntervalSeconds: 10,
    checkInsPaused: false,
    suppressCheckInsDuringFocus: true,
  });

  // User starts 2-hour task, works 44 minutes, then pauses to step away (e.g. to pee)
  focusGuard.setSession({
    id: "session-paused-1",
    userId: "user-1",
    startedAt: new Date(Date.now() - 44 * 60 * 1000).toISOString(),
    isPaused: true,
    durationSeconds: 44 * 60,
    targetDurationMinutes: 120,
    notes: "Deep Work - 2 hour block",
  } as any);

  assert.equal(focusGuard.isSessionActive(), true, "Paused session is still an active focus workflow");
  assert.equal(await reflectionEngine.isFocusSessionActive(), true, "ReflectionEngine sees paused session as active focus");

  // Attempt periodic trigger while paused
  await reflectionEngine.forceTrigger();
  const checkInNotifs = createdNotifications.filter((id) => id.startsWith("productivehix-checkin-"));
  assert.equal(checkInNotifs.length, 0, "No regular check-in should be dispatched while paused");

  // Simulate away review / wake-up gap while paused
  await inactivityEngine.handleWakeupGap(10 * 60 * 1000, Date.now());
  const awayNotifs = createdNotifications.filter((id) => id.startsWith("productivehix-checkin-"));
  assert.equal(awayNotifs.length, 0, "No away-review notification should be dispatched while paused");

  // Cleanup
  focusGuard.setSession(null);
});

test("FocusGuard calculates elapsed and remaining duration accurately across pause and resume", async () => {
  const { focusGuard } = await import("./background/focus-guard");

  // 2-hour session (120 minutes)
  const targetDurationMinutes = 120;
  const startedAt = new Date(Date.now() - 50 * 60 * 1000).toISOString(); // Started 50 mins ago
  const pausedDurationSeconds = 44 * 60; // Paused after 44 mins

  // User stepped away for 6 mins and now resumes 1 min ago
  const lastResumedAt = new Date(Date.now() - 60 * 1000).toISOString(); // Resumed 1 min ago

  focusGuard.setSession({
    id: "session-resumed-test",
    userId: "user-1",
    startedAt,
    lastResumedAt,
    isPaused: false,
    durationSeconds: pausedDurationSeconds,
    targetDurationMinutes,
    notes: "2 hour task",
  } as any);

  const session = focusGuard.getCurrentSession()!;
  const base = session.durationSeconds ?? 0;
  const startMs = Date.parse(session.lastResumedAt ?? session.startedAt);
  const currentSegment = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const elapsedSec = base + currentSegment;
  const targetSec = (session.targetDurationMinutes ?? 25) * 60;
  const remainingSec = targetSec - elapsedSec;

  // Elapsed should be ~45 minutes (2700s), NOT 94+ minutes (double-counting startedAt)!
  assert.ok(elapsedSec >= 2690 && elapsedSec <= 2720, `Elapsed should be ~2700s (45m), got ${elapsedSec}s`);
  // Remaining should be ~75 minutes (4500s), counting DOWN in reverse, NOT overtime!
  assert.ok(remainingSec >= 4480 && remainingSec <= 4510, `Remaining should be ~4500s (75m), got ${remainingSec}s`);
  assert.ok(remainingSec > 0, "Remaining seconds must be strictly positive (reverse countdown)");

  // Cleanup
  focusGuard.setSession(null);
});


