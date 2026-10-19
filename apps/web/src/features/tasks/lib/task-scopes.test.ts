/**
 * Regression guard for the Backlog → Today due-date promotion bug.
 *
 * Root cause (Sep 2026): `isTodayTask`/`isOverdueTask` evaluated the
 * `productiveDate > targetDate` veto BEFORE the deadline check, so editing a
 * task's due date from Oct 1 → Sep 30 (today) while `productiveDate` still
 * pointed at Oct 1 left the task stuck in Upcoming — it never surfaced in
 * Today. The same veto hid past-due + future-scheduled tasks from Overdue.
 *
 * Invariant locked by these tests:
 * - A deadline due today ALWAYS qualifies for Today, regardless of a future
 *   `productiveDate` (deadline wins over schedule).
 * - A past deadline is Overdue even with a future `productiveDate`, unless
 *   the task is already scheduled for today (rolled-over → Today wins).
 *
 * Run: `pnpm --filter @repo/analytics exec tsx --test
 *   ../../apps/web/src/features/tasks/lib/task-scopes.test.ts`
 * (web has no dedicated runner yet; node:test + tsx, zero new deps).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Task } from "@repo/types";
import {
  effectiveScheduleKey,
  isBacklogTask,
  isOverdueTask,
  isTodayTask,
  isUpcomingTask,
} from "./task-scopes";

const TARGET = "2026-09-30";
const NO_GOALS = new Set<string>();

/**
 * Builds a `dueAt` ISO timestamp the same way the app's editors do (local
 * wall-clock time → ISO), and safely inside the productive day (local noon
 * can never spill across a midnight/04:00 boundary in any timezone).
 * Hardcoding `…T23:59:59.000Z` (UTC) would resolve to the NEXT productive
 * day in IST (+05:30) and make the test timezone-fragile.
 */
function dueAtFor(day: string): string {
  return new Date(`${day}T12:00:00`).toISOString();
}

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "t1",
    userId: "u1",
    title: "understand enable, refetch triggers and retries behaviour",
    description: null,
    status: "todo",
    priority: "medium",
    plannedDurationMinutes: 30,
    plannedStart: null,
    actualDurationSeconds: 0,
    dueAt: null,
    completedAt: null,
    goalId: null,
    goalTitle: null,
    productiveDate: null,
    createdAt: "2026-09-29T10:00:00.000Z",
    updatedAt: "2026-09-29T10:00:00.000Z",
    sessionsCount: 0,
    hasActiveSession: false,
    ...overrides,
  } as Task;
}

describe("task-scopes: due-date promotion (Backlog → Today)", () => {
  it("due-today task with a future productiveDate IS a Today task (reported bug)", () => {
    const task = makeTask({
      productiveDate: "2026-10-01",
      dueAt: dueAtFor("2026-09-30"),
    });
    assert.equal(isTodayTask(task, TARGET, NO_GOALS), true);
    assert.equal(isOverdueTask(task, TARGET, NO_GOALS), false);
    assert.equal(isUpcomingTask(task, TARGET, NO_GOALS), false);
    assert.equal(isBacklogTask(task, TARGET, NO_GOALS), false);
  });

  it("past-due task with a future productiveDate IS Overdue (not stuck in Upcoming)", () => {
    const task = makeTask({
      productiveDate: "2026-10-01",
      dueAt: dueAtFor("2026-09-28"),
    });
    assert.equal(isOverdueTask(task, TARGET, NO_GOALS), true);
    assert.equal(isTodayTask(task, TARGET, NO_GOALS), false);
    assert.equal(isUpcomingTask(task, TARGET, NO_GOALS), false);
  });

  it("past-due task already scheduled for today stays in Today (rollover wins)", () => {
    const task = makeTask({
      productiveDate: TARGET,
      dueAt: "2026-09-28T23:59:59.000Z",
    });
    assert.equal(isTodayTask(task, TARGET, NO_GOALS), true);
    assert.equal(isOverdueTask(task, TARGET, NO_GOALS), false);
  });

  it("future scheduled + future due stays Upcoming (no leakage into Today)", () => {
    const task = makeTask({
      productiveDate: "2026-10-01",
      dueAt: "2026-10-01T23:59:59.000Z",
    });
    assert.equal(isTodayTask(task, TARGET, NO_GOALS), false);
    assert.equal(isOverdueTask(task, TARGET, NO_GOALS), false);
    assert.equal(isUpcomingTask(task, TARGET, NO_GOALS), true);
    assert.equal(isBacklogTask(task, TARGET, NO_GOALS), false);
  });

  it("dateless task stays Backlog (never fabricated into Upcoming/Overdue)", () => {
    const task = makeTask({ productiveDate: null, dueAt: null });
    assert.equal(isTodayTask(task, TARGET, NO_GOALS), false);
    assert.equal(isOverdueTask(task, TARGET, NO_GOALS), false);
    assert.equal(isUpcomingTask(task, TARGET, NO_GOALS), false);
    assert.equal(isBacklogTask(task, TARGET, NO_GOALS), true);
  });

  it("partition: no actionable task is both Today and Overdue", () => {
    const cases = [
      makeTask({ productiveDate: "2026-10-01", dueAt: "2026-09-30T23:59:59.000Z" }),
      makeTask({ productiveDate: "2026-10-01", dueAt: "2026-09-28T23:59:59.000Z" }),
      makeTask({ productiveDate: TARGET, dueAt: "2026-09-28T23:59:59.000Z" }),
      makeTask({ productiveDate: TARGET, dueAt: "2026-09-30T23:59:59.000Z" }),
      makeTask({ productiveDate: "2026-09-28", dueAt: null }),
      makeTask({ productiveDate: null, dueAt: null }),
    ];
    for (const task of cases) {
      const today = isTodayTask(task, TARGET, NO_GOALS);
      const overdue = isOverdueTask(task, TARGET, NO_GOALS);
      assert.equal(
        today && overdue,
        false,
        `task ${task.productiveDate}/${task.dueAt} is both Today and Overdue`,
      );
    }
  });

  it("task linked to goal from another day surfaces in Today when due today or scheduled today", () => {
    const priorDayGoalId = "goal-from-sep-29";
    const taskDueToday = makeTask({
      goalId: priorDayGoalId,
      productiveDate: "2026-10-01",
      dueAt: dueAtFor(TARGET),
    });
    const taskScheduledToday = makeTask({
      goalId: priorDayGoalId,
      productiveDate: TARGET,
      dueAt: null,
    });
    // today's goals do not include priorDayGoalId
    assert.equal(isTodayTask(taskDueToday, TARGET, NO_GOALS), true);
    assert.equal(isTodayTask(taskScheduledToday, TARGET, NO_GOALS), true);
  });
});

describe("task-scopes: effectiveScheduleKey", () => {
  it("picks the earlier date when both productiveDate and dueAt are set", () => {
    const task1 = makeTask({
      productiveDate: "2026-10-01",
      dueAt: dueAtFor("2026-09-30"),
    });
    assert.equal(effectiveScheduleKey(task1), "2026-09-30");

    const task2 = makeTask({
      productiveDate: "2026-09-28",
      dueAt: dueAtFor("2026-10-01"),
    });
    assert.equal(effectiveScheduleKey(task2), "2026-09-28");
  });

  it("falls back to the single available date or null", () => {
    assert.equal(effectiveScheduleKey(makeTask({ productiveDate: "2026-10-02" })), "2026-10-02");
    assert.equal(effectiveScheduleKey(makeTask({ dueAt: dueAtFor("2026-10-03") })), "2026-10-03");
    assert.equal(effectiveScheduleKey(makeTask({ productiveDate: null, dueAt: null })), null);
  });
});
