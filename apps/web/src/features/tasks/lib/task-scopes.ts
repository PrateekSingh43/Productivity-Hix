import type { Task } from "@repo/types";
import { resolveProductiveDay } from "@repo/types";

/**
 * Canonical task-scope predicates (Today vs Overdue vs Upcoming vs Backlog).
 *
 * Domain model:
 * - `productiveDate` (YYYY-MM-DD) = the day the task is *scheduled* to be worked on.
 * - `dueAt` (ISO timestamp) = the *deadline* by which the task should be completed.
 *   Creation flows may couple them (Quick Add sets both to the same day), but
 *   they are semantically distinct: rescheduling changes `productiveDate` and
 *   preserves `dueAt`, matching Todoist (scheduled date vs deadline) and Linear
 *   (cycle placement vs due date).
 *
 * Scopes (for incomplete tasks) form a strict partition — every actionable
 * task not in Today/Overdue lands in exactly one of Upcoming/Backlog:
 * - Today: active session, linked to a target-date goal, scheduled for the
 *   target productive day, or due that day.
 * - Overdue: incomplete, past its deadline/scheduled day, not claimed by Today.
 * - Upcoming: incomplete, not Today/Overdue, carrying ANY date (scheduled day
 *   or deadline — including a past scheduled day with a still-future deadline,
 *   which needs rescheduling rather than disappearing).
 * - Backlog: incomplete with no schedule and no deadline (true unscheduled pile).
 *
 * All consumers (Today, Tasks, Home/Dashboard) must use these helpers instead
 * of inline copies so day-boundary and timezone rules stay consistent.
 */
export function resolveTargetDate(planDate: string | null | undefined, localTodayDate: string): string {
  // Today-scoped surfaces (Today, Tasks/Today tab, Dashboard) must always be
  // anchored to the current productive day. A future `plan.date` (stale cache,
  // pre-created future plan, timezone skew) must never shift "Today" forward —
  // otherwise future tasks (e.g. Oct 2) leak into Today's Priorities and the
  // Sep 28 / Sep 30 / today split collapses. Past/missing dates also resolve
  // to today; historical days live in History, not Today.
  void planDate;
  return localTodayDate;
}

/**
 * Derives the productive-day key (YYYY-MM-DD) for a deadline timestamp.
 *
 * Uses the productive-day resolver (timezone + day boundary aware) instead of
 * a raw calendar `format()` so a 00:30 deadline with a 04:00 boundary still
 * belongs to the previous productive day, and `dueAt` classifies identically
 * to `productiveDate` string comparison.
 *
 * @param dueAt ISO timestamp deadline, or null.
 * @returns YYYY-MM-DD productive-day key, or null when no deadline.
 */
export function dueDateKey(dueAt: string | null | undefined): string | null {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return null;
  return resolveProductiveDay(d);
}

/**
 * Effective scheduling key for ordering: when both schedule and deadline exist,
 * the earlier of the two determines chronological placement (so an impending
 * deadline is never hidden behind a later scheduled date). If only one is
 * present, that date is used.
 */
export function effectiveScheduleKey(task: Task): string | null {
  const due = dueDateKey(task.dueAt);
  if (task.productiveDate && due) {
    return task.productiveDate < due ? task.productiveDate : due;
  }
  return task.productiveDate ?? due ?? null;
}

export function isTodayTask(task: Task, targetDate: string, todayGoalIds: Set<string>): boolean {
  if (task.hasActiveSession) return true;
  // Deadline wins over schedule: a task due today must surface in Today even
  // when its `productiveDate` still points at a future day (e.g. due edited
  // from Oct 1 → Sep 30 while scheduled day lagged behind). Without this,
  // due-date edits in Backlog never promote to Today and the task looks stuck.
  const due = dueDateKey(task.dueAt);
  if (due !== null && due === targetDate) return true;
  // An explicit future schedule wins over goal linkage only (not over the
  // deadline checked above). Without this, a task parked for Oct 2 but linked
  // to one of today's goals (easy via Quick Add's goal picker) hijacks
  // Today's Priorities, and the Today / Upcoming partition collapses.
  if (task.productiveDate != null && task.productiveDate > targetDate) return false;
  if (task.goalId && todayGoalIds.has(task.goalId)) return true;
  if (task.productiveDate === targetDate) return true;
  return false;
}

export function isOverdueTask(task: Task, targetDate: string, todayGoalIds: Set<string>): boolean {
  if (task.status === "done" || task.status === "cancelled") return false;
  if (task.hasActiveSession) return false;
  // A past deadline is overdue even when the scheduled day still points at
  // the future (productiveDate > dueAt inconsistency from a due-date edit
  // that did not realign the schedule). Otherwise such tasks sink into
  // Upcoming forever with no reschedule affordance. A task already scheduled
  // for today stays in Today ("rolled over to today"), not Overdue.
  const due = dueDateKey(task.dueAt);
  if (due !== null && due < targetDate) {
    if (task.productiveDate === targetDate) return false;
    if (task.goalId && todayGoalIds.has(task.goalId)) return false;
    return true;
  }
  if (task.productiveDate && task.productiveDate >= targetDate) return false;
  if (task.goalId && todayGoalIds.has(task.goalId)) return false;
  if (due !== null) return due < targetDate;
  return Boolean(task.productiveDate && task.productiveDate < targetDate);
}

export function isActionableTask(task: Task): boolean {
  return task.status !== "done" && task.status !== "cancelled";
}

/**
 * Upcoming: incomplete, not for today, not overdue, but carrying ANY date
 * (scheduled day or deadline). Partition guarantee: together with Backlog this
 * covers every actionable non-Today non-Overdue task, so no task can ever be
 * invisible (e.g. scheduled in the past with a still-future deadline sorts
 * here, at the top, awaiting reschedule — never dropped).
 * Sorted ascending by effective date so Sep 28 surfaces before Sep 30
 * (Todoist Upcoming / Linear upcoming-cycle behaviour).
 */
export function isUpcomingTask(
  task: Task,
  targetDate: string,
  todayGoalIds: Set<string>,
): boolean {
  if (!isActionableTask(task)) return false;
  if (isTodayTask(task, targetDate, todayGoalIds)) return false;
  if (isOverdueTask(task, targetDate, todayGoalIds)) return false;
  return task.productiveDate != null || dueDateKey(task.dueAt) !== null;
}

/**
 * Backlog: incomplete with no schedule and no deadline — genuine unscheduled
 * pile (Todoist Inbox / Linear backlog). Future-dated tasks are Upcoming,
 * never Backlog.
 */
export function isBacklogTask(
  task: Task,
  targetDate: string,
  todayGoalIds: Set<string>,
): boolean {
  if (!isActionableTask(task)) return false;
  if (isTodayTask(task, targetDate, todayGoalIds)) return false;
  if (isOverdueTask(task, targetDate, todayGoalIds)) return false;
  return effectiveScheduleKey(task) === null;
}

/** Whole days from targetDate until the task's effective date (future only). */
export function daysUntil(task: Task, targetDate: string): number | null {
  const key = effectiveScheduleKey(task);
  if (!key || key <= targetDate) return null;
  const ms = new Date(`${key}T12:00:00Z`).getTime() - new Date(`${targetDate}T12:00:00Z`).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

/** Ascending by effective schedule key; unscheduled sink to the end, then by creation. */
export function compareByEffectiveDateAsc(a: Task, b: Task): number {
  const ka = effectiveScheduleKey(a);
  const kb = effectiveScheduleKey(b);
  if (ka && kb && ka !== kb) return ka < kb ? -1 : 1;
  if (ka && !kb) return -1;
  if (!ka && kb) return 1;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}
