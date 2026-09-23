import { format } from "date-fns";
import type { Task } from "@repo/types";

/**
 * Canonical task-scope predicates (Today vs Overdue membership).
 *
 * These encode the existing domain rules already applied inline by the Today
 * and Tasks pages: a task belongs to Today when it has an active session, is
 * linked to one of today's goals, is scheduled for the target productive day,
 * or is due that day; it is Overdue when incomplete, past its deadline, and
 * not claimed by any of those Today rules. Status filtering (done/cancelled)
 * is intentionally left to callers, matching the page-level copies.
 *
 * New consumers (e.g. Home) should use these helpers instead of adding
 * another inline copy. The pre-existing page-level copies are deliberately
 * left untouched.
 */
export function resolveTargetDate(planDate: string | null | undefined, localTodayDate: string): string {
  return planDate && planDate >= localTodayDate ? planDate : localTodayDate;
}

function dueDateKey(dueAt: string | null | undefined): string | null {
  if (!dueAt) return null;
  return format(new Date(dueAt), "yyyy-MM-dd");
}

export function isTodayTask(task: Task, targetDate: string, todayGoalIds: Set<string>): boolean {
  if (task.hasActiveSession) return true;
  if (task.goalId && todayGoalIds.has(task.goalId)) return true;
  if (task.productiveDate === targetDate) return true;
  const due = dueDateKey(task.dueAt);
  if (due !== null && due === targetDate) return true;
  return false;
}

export function isOverdueTask(task: Task, targetDate: string, todayGoalIds: Set<string>): boolean {
  if (task.status === "done" || task.status === "cancelled") return false;
  if (task.hasActiveSession) return false;
  if (task.productiveDate && task.productiveDate >= targetDate) return false;
  if (task.goalId && todayGoalIds.has(task.goalId)) return false;
  const due = dueDateKey(task.dueAt);
  if (due !== null) return due < targetDate;
  return Boolean(task.productiveDate && task.productiveDate < targetDate);
}

export function isActionableTask(task: Task): boolean {
  return task.status !== "done" && task.status !== "cancelled";
}
