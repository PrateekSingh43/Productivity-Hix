import { describe, it, expect } from "vitest";
import type { Task, WorkSession } from "@repo/types";
import { groupSessionsByDay, groupSessionsByTask } from "./session-groups";

const KOLKATA = { timezone: "Asia/Kolkata", boundary: "04:00" };
// Midnight boundary in IST: the mission's local times (Sep 29 8:44 PM,
// Sep 30 2:04 AM, Oct 2 5:06 AM) land on three distinct productive days.
const UTC_DAYS = { timezone: "Asia/Kolkata", boundary: "00:00" };

function session(
  id: string,
  startedAt: string,
  durationSeconds: number,
  targetMinutes: number | null,
  taskId: string | null = "task-x",
): WorkSession {
  return {
    id,
    taskId,
    startedAt,
    endedAt: startedAt,
    durationSeconds: durationSeconds,
    targetDurationMinutes: targetMinutes,
    source: "manual",
    taskTitle: "Trace the useQuery lifecycle",
    goalTitle: "Learn TanStack Query",
  };
}

const TASK = { id: "task-x", title: "Trace the useQuery lifecycle" } as Task;

// Mission example: 60/90, 50/96, 60/26 → targets 170m, actual 212m, +42m.
const THREE = [
  session("s1", "2026-09-29T15:14:00.000Z", 90 * 60, 60), // 20:44 IST Sep 29
  session("s2", "2026-09-29T20:34:00.000Z", 96 * 60, 50), // 02:04 IST Sep 30
  session("s3", "2026-10-01T23:36:00.000Z", 26 * 60, 60), // 05:06 IST Oct 2
];

describe("groupSessionsByTask", () => {
  it("aggregates the mission example without merging sessions", () => {
    const groups = groupSessionsByTask(THREE, [TASK], UTC_DAYS);
    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(g.sessionCount).toBe(3);
    expect(g.sessions.map((s) => s.id)).toEqual(["s3", "s2", "s1"]);
    expect(g.totalTargetSecs).toBe(170 * 60);
    expect(g.totalActualSecs).toBe(212 * 60);
    expect(g.varianceSecs).toBe(42 * 60);
    expect(g.firstDay).toBe("2026-09-29");
    expect(g.lastDay).toBe("2026-10-02");
  });

  it("leaves target totals null when any session lacks a target", () => {
    const groups = groupSessionsByTask(
      [session("s1", "2026-09-29T15:14:00.000Z", 90 * 60, 60), session("s2", "2026-09-30T08:00:00.000Z", 30 * 60, null)],
      [TASK],
      UTC_DAYS,
    );
    expect(groups[0]!.totalTargetSecs).toBeNull();
    expect(groups[0]!.varianceSecs).toBeNull();
    expect(groups[0]!.totalActualSecs).toBe(120 * 60);
  });

  it("groups independent sessions separately, last", () => {
    const groups = groupSessionsByTask(
      [...THREE, session("s9", "2026-10-02T08:00:00.000Z", 20 * 60, null, null)],
      [TASK],
      UTC_DAYS,
    );
    expect(groups).toHaveLength(2);
    expect(groups[1]!.taskId).toBeNull();
    expect(groups[1]!.sessionCount).toBe(1);
  });
});

describe("groupSessionsByDay", () => {
  it("attributes by productive day, newest first", () => {
    const groups = groupSessionsByDay(THREE, UTC_DAYS);
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-10-02", "2026-09-30", "2026-09-29"]);
    expect(groups[1]!.totalSecs).toBe(96 * 60);
  });

  it("pre-boundary instants fall on the previous productive day", () => {
    // 02:04 IST Sep 30 with a 04:00 boundary → Sep 29? No: 02:04 < 04:00 → Sep 29.
    const groups = groupSessionsByDay(
      [session("s2", "2026-09-29T20:34:00.000Z", 96 * 60, 50)],
      KOLKATA,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.dayKey).toBe("2026-09-29");
  });
});
