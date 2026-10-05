import { resolveProductiveDay } from "@repo/types";
import type { Task, WorkSession } from "@repo/types";

export interface SessionGroupingOptions {
  timezone?: string;
  boundary?: string;
}

function groupingDefaults(options: SessionGroupingOptions = {}): Required<SessionGroupingOptions> {
  return {
    timezone: options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
    boundary: options.boundary ?? "00:00",
  };
}

export function sessionDayKey(
  startedAt: string,
  options: SessionGroupingOptions = {},
): string {
  const { timezone, boundary } = groupingDefaults(options);
  return resolveProductiveDay(startedAt, { timezone, boundary });
}

export interface SessionDayGroup {
  dayKey: string;
  totalSecs: number;
  sessions: WorkSession[];
}

/**
 * Chronological truth: sessions grouped by productive day (never raw UTC
 * slice), days newest-first, sessions within a day newest-first. Sessions
 * are never merged — each row stays individually preserved.
 */
export function groupSessionsByDay(
  sessions: WorkSession[],
  options: SessionGroupingOptions = {},
): SessionDayGroup[] {
  const map = new Map<string, WorkSession[]>();
  for (const sess of sessions) {
    if (!sess.startedAt) continue;
    const key = sessionDayKey(sess.startedAt, options);
    const list = map.get(key) ?? [];
    list.push(sess);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKey, list]) => ({
      dayKey,
      totalSecs: list.reduce((acc, s) => acc + Math.max(0, s.durationSeconds ?? 0), 0),
      sessions: [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    }));
}

export interface TaskSessionGroup {
  key: string;
  taskId: string | null;
  title: string;
  goalTitle: string | null;
  sessionCount: number;
  firstDay: string;
  lastDay: string;
  totalActualSecs: number;
  /** Sum of session targets in seconds, or null when ANY session lacks a target. */
  totalTargetSecs: number | null;
  /** totalActualSecs - totalTargetSecs, or null when targets are incomplete. */
  varianceSecs: number | null;
  sessions: WorkSession[];
}

/**
 * Task-oriented organization: repeated sessions on the same task grouped
 * visually while every session stays individually preserved.
 *
 * Aggregate rules (never overstated):
 * - totalActualSecs always sums recorded durations.
 * - totalTargetSecs sums targets ONLY when every session in the group has
 *   one; a single target-less session makes it (and variance) null.
 * - Ordering: task groups by lastDay desc, then title; the independent
 *   group (task-less sessions) always comes last.
 */
export function groupSessionsByTask(
  sessions: WorkSession[],
  tasks: Pick<Task, "id" | "title">[],
  options: SessionGroupingOptions = {},
): TaskSessionGroup[] {
  const titles = new Map(tasks.map((t) => [t.id, t.title]));
  const map = new Map<string, WorkSession[]>();
  for (const sess of sessions) {
    const key = sess.taskId ?? "independent";
    const list = map.get(key) ?? [];
    list.push(sess);
    map.set(key, list);
  }

  const groups: TaskSessionGroup[] = [];
  for (const [key, list] of map.entries()) {
    const ordered = [...list].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const days = ordered.map((s) => sessionDayKey(s.startedAt, options)).sort();
    const totalActualSecs = ordered.reduce(
      (acc, s) => acc + Math.max(0, s.durationSeconds ?? 0),
      0,
    );
    const targets = ordered.map((s) =>
      s.targetDurationMinutes != null ? s.targetDurationMinutes * 60 : null,
    );
    const complete = targets.every((t): t is number => t != null);
    const totalTargetSecs = complete
      ? targets.reduce((acc, t) => acc + (t as number), 0)
      : null;
    const first = ordered[ordered.length - 1]!;
    groups.push({
      key,
      taskId: key === "independent" ? null : key,
      title:
        key === "independent"
          ? "Independent focus blocks"
          : (titles.get(key) ?? first.taskTitle ?? first.notes ?? "Task"),
      goalTitle: first.goalTitle ?? null,
      sessionCount: ordered.length,
      firstDay: days[0]!,
      lastDay: days[days.length - 1]!,
      totalActualSecs,
      totalTargetSecs,
      varianceSecs: totalTargetSecs != null ? totalActualSecs - totalTargetSecs : null,
      sessions: ordered,
    });
  }

  return groups.sort((a, b) => {
    if ((a.taskId == null) !== (b.taskId == null)) return a.taskId == null ? 1 : -1;
    if (a.lastDay !== b.lastDay) return b.lastDay.localeCompare(a.lastDay);
    return a.title.localeCompare(b.title);
  });
}
