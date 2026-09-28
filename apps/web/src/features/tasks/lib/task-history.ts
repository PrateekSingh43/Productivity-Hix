import type { Task, WorkSession } from "@repo/types";
import { resolveProductiveDay } from "@repo/types";
import { dueDateKey, effectiveScheduleKey } from "./task-scopes";

export type HistoryFilter = "all" | "completed" | "missed";

export interface HistoryGroup {
  date: string;
  label: string;
  isToday: boolean;
  isPast: boolean;
  /** Tasks visible under the active sub-filter (what is rendered). */
  tasks: Task[];
  /** Unfiltered totals for the day (stable badge even when sub-filtered). */
  totalCount: number;
  completedCount: number;
  actualMins: number;
}

/**
 * Resolves the logbook day (YYYY-MM-DD) a task belongs to.
 *
 * Production logbook semantics (Todoist completed by_completion_date /
 * Things Logbook): finished work is grouped by *when it finished*, not when
 * it was scheduled. Incomplete work appears under its scheduled day only when
 * that day is today or in the past (missed); future-scheduled (Upcoming) and
 * dateless (Backlog) incompletes are NOT history and return null so they can
 * never pollute the logbook.
 *
 * All timestamp → day conversions are productive-day aware (timezone + day
 * boundary), never a raw UTC `slice(0, 10)`.
 *
 * @param task Task row from the list endpoint.
 * @param todayDate Current productive day (YYYY-MM-DD).
 * @returns Day key, or null when the task must not appear in history.
 */
export function historyDayKey(task: Task, todayDate: string): string | null {
  if (task.status === "done" || task.status === "cancelled") {
    const stamp = task.completedAt ?? task.updatedAt ?? task.createdAt;
    if (!stamp) return null;
    try {
      // Pass the raw stamp through: YYYY-MM-DD strings pass through
      // untouched, ISO timestamps resolve timezone/boundary aware.
      return resolveProductiveDay(stamp);
    } catch {
      return null;
    }
  }

  const key = task.productiveDate ?? dueDateKey(task.dueAt) ?? null;
  if (!key) return null; // unscheduled backlog incompletes are not history
  if (key > todayDate) return null; // future upcoming tasks are not history
  return key;
}

/**
 * Predicate for the history sub-filter pills.
 */
export function matchesHistoryFilter(task: Task, filter: HistoryFilter): boolean {
  if (filter === "completed") return task.status === "done";
  if (filter === "missed") return task.status !== "done" && task.status !== "cancelled";
  return true;
}

/**
 * Deterministic within-day ordering: finished work newest-first by
 * completion stamp, then most-recently-updated, then most-recently-created.
 * Guarantees a stable logbook order independent of API row order.
 */
export function compareHistoryTasksDesc(a: Task, b: Task): number {
  const stamp = (t: Task) => t.completedAt ?? t.updatedAt ?? t.createdAt ?? "";
  const sa = stamp(a);
  const sb = stamp(b);
  if (sa !== sb) return sa < sb ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Builds newest-first day groups for the History / Logbook view.
 *
 * - Groups by {@link historyDayKey} (completion day for finished work).
 * - Drops non-history tasks (future upcoming, dateless backlog incompletes).
 * - Sorts days newest-first and tasks within each day newest-first.
 * - Computes per-day totals from the UNFILTERED day list so the
 *   `x / y completed` badge stays truthful while the rendered list obeys the
 *   active sub-filter (empty-after-filter groups are dropped).
 * - `actualMins` attributes task-linked sessions by OCCURRENCE day, never
 *   cumulative task totals (same root-cause fix as the Today ribbon).
 *
 * @param tasks Full task list from the query cache.
 * @param todayDate Current productive day (YYYY-MM-DD).
 * @param filter Active sub-filter pill.
 * @param sessions Work sessions for day attribution (task-linked ones only
 *   feed per-day recorded minutes; unlinked focus lives in Sessions view).
 */
export function buildHistoryGroups(
  tasks: Task[],
  todayDate: string,
  filter: HistoryFilter,
  sessions: Pick<WorkSession, "startedAt" | "durationSeconds" | "taskId">[] = [],
): HistoryGroup[] {
  const groupsMap = new Map<string, Task[]>();

  for (const t of tasks) {
    const key = historyDayKey(t, todayDate);
    if (!key) continue;
    const list = groupsMap.get(key) ?? [];
    list.push(t);
    groupsMap.set(key, list);
  }

  const sortedDates = Array.from(groupsMap.keys()).sort((a, b) => b.localeCompare(a));

  const groups: HistoryGroup[] = [];
  for (const dateStr of sortedDates) {
    const rawList = groupsMap.get(dateStr) ?? [];
    const completedCount = rawList.filter((t) => t.status === "done").length;
    const totalCount = rawList.length;
    const dayTaskIds = new Set(rawList.map((t) => t.id));
    const daySessions = sessions.filter((s) => s.taskId && dayTaskIds.has(s.taskId));
    const totalSeconds = sumSessionSecondsForDay(daySessions, dateStr);

    const filteredList = rawList
      .filter((t) => matchesHistoryFilter(t, filter))
      .sort(compareHistoryTasksDesc);
    if (filteredList.length === 0) continue;

    groups.push({
      date: dateStr,
      label: dateStr,
      isToday: dateStr === todayDate,
      isPast: dateStr < todayDate,
      tasks: filteredList,
      totalCount,
      completedCount,
      actualMins: Math.round(totalSeconds / 60),
    });
  }

  return groups;
}

/**
 * History-eligible subset (what the header totals describe). Keeps the
 * "Total logged / Completed / Missed" ribbon consistent with the groups
 * rendered below instead of counting future + backlog tasks.
 */
export function historyEligibleTasks(tasks: Task[], todayDate: string): Task[] {
  return tasks.filter((t) => historyDayKey(t, todayDate) !== null);
}

/**
 * Productive day a focus session belongs to, from its start timestamp.
 * Timezone/boundary aware — never a raw UTC slice.
 */
export function sessionDayKey(startedAt: string): string | null {
  try {
    return resolveProductiveDay(startedAt);
  } catch {
    return null;
  }
}

/**
 * Focus seconds recorded on one productive day.
 *
 * ROOT-CAUSE FIX: day-level focus numbers ("Actual Focus Today", per-day
 * "recorded") must attribute each session to the day it OCCURRED. Summing
 * cumulative per-task totals instead inflated "today" with sessions from
 * earlier days (e.g. Sept 12/25 sessions counted into Sept 28's total).
 * Per-task cumulative `actualDurationSeconds` stays the source for per-task
 * "total invested" displays — only day buckets use this.
 *
 * A session counts wholly toward its start day (midnight-spanning sessions
 * are not split — matches the Sessions view grouping). Active (unended)
 * sessions count their banked durationSeconds so far.
 *
 * @param sessions Work sessions (linked or not — pass a pre-filtered list
 *   to scope, e.g. only sessions of the day's task group).
 * @param day YYYY-MM-DD productive day.
 */
export function sumSessionSecondsForDay(
  sessions: Pick<WorkSession, "startedAt" | "durationSeconds">[],
  day: string,
): number {
  let total = 0;
  for (const s of sessions) {
    if (!s.startedAt) continue;
    if (sessionDayKey(s.startedAt) !== day) continue;
    total += Math.max(0, s.durationSeconds ?? 0);
  }
  return total;
}

/**
 * Day label for a history group. Today and Yesterday get friendly prefixes
 * (matching the Sessions history view); older days get a full date.
 */
export function formatHistoryDayLabel(dateStr: string, todayDate: string): string {
  if (dateStr === todayDate) return `Today · ${formatNoTime(dateStr, "EEE, MMM d")}`;
  const yesterday = shiftDay(todayDate, -1);
  if (dateStr === yesterday) return `Yesterday · ${formatNoTime(dateStr, "EEE, MMM d")}`;
  return formatNoTime(dateStr, "EEEE, MMMM d, yyyy");
}

function shiftDay(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

function formatNoTime(dateStr: string, pattern: "EEE, MMM d" | "EEEE, MMMM d, yyyy"): string {
  try {
    const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const weekday =
      pattern === "EEE, MMM d"
        ? dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
        : dt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    const monthDay = dt.toLocaleDateString("en-US", {
      month: pattern === "EEE, MMM d" ? "short" : "long",
      day: "numeric",
      timeZone: "UTC",
    });
    if (pattern === "EEE, MMM d") return `${weekday}, ${monthDay}`;
    return `${weekday}, ${monthDay}, ${y}`;
  } catch {
    return dateStr;
  }
}

export { effectiveScheduleKey };
