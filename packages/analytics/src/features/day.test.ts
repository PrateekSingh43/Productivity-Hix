import { strict as assert } from "node:assert";
import { test } from "node:test";
import { extractDayFeatures } from "./day";
import type { SessionFeatures } from "./session";
import type { CheckIn, Task } from "@repo/types";

const mockSessionFeatures = (
  durationSeconds: number,
  productiveDurationSeconds: number,
  distractionDurationSeconds: number,
  contextSwitchCount: number,
): SessionFeatures => ({
  durationSeconds,
  activeDurationSeconds: productiveDurationSeconds + distractionDurationSeconds,
  contextCount: 2,
  contextSwitchCount,
  contextSwitchesPerHour: (contextSwitchCount / (durationSeconds / 3600)) || 0,
  productiveDurationSeconds,
  idleDurationSeconds: durationSeconds - (productiveDurationSeconds + distractionDurationSeconds),
  distractionDurationSeconds,
});

test("day features: empty day produces zeroed measurements", () => {
  const day = extractDayFeatures({ date: "2026-01-01" });

  assert.equal(day.date, "2026-01-01");
  assert.equal(day.totalSessionCount, 0);
  assert.equal(day.totalSessionDurationSeconds, 0);
  assert.equal(day.totalProductiveDurationSeconds, 0);
  assert.equal(day.totalDistractionDurationSeconds, 0);
  assert.equal(day.totalContextSwitches, 0);
  assert.equal(day.averageSessionDurationSeconds, 0);
  assert.equal(day.longestSessionDurationSeconds, 0);
  assert.equal(day.completedTaskCount, 0);
  assert.equal(day.createdTaskCount, 0);
  assert.equal(day.taskCompletionRate, 0);
  assert.equal(day.checkInCount, 0);
});

test("day features: single session day", () => {
  const s1 = mockSessionFeatures(1800, 1500, 300, 3);
  const tasks: Pick<Task, "status">[] = [{ status: "done" }, { status: "todo" }];
  const checkIns = [{ id: "c1" }] as CheckIn[];

  const day = extractDayFeatures({
    date: "2026-01-01",
    sessionFeatures: [s1],
    tasks,
    checkIns,
  });

  assert.equal(day.totalSessionCount, 1);
  assert.equal(day.totalSessionDurationSeconds, 1800);
  assert.equal(day.totalProductiveDurationSeconds, 1500);
  assert.equal(day.totalDistractionDurationSeconds, 300);
  assert.equal(day.totalContextSwitches, 3);
  assert.equal(day.averageSessionDurationSeconds, 1800);
  assert.equal(day.longestSessionDurationSeconds, 1800);
  assert.equal(day.completedTaskCount, 1);
  assert.equal(day.createdTaskCount, 2);
  assert.equal(day.taskCompletionRate, 0.5);
  assert.equal(day.checkInCount, 1);
});

test("day features: multiple sessions, average session, and longest session", () => {
  const s1 = mockSessionFeatures(1800, 1200, 300, 2); // 30 min
  const s2 = mockSessionFeatures(3600, 3000, 600, 5); // 60 min
  const s3 = mockSessionFeatures(1200, 900, 0, 1);   // 20 min

  const tasks: Pick<Task, "status">[] = [
    { status: "done" },
    { status: "done" },
    { status: "done" },
    { status: "in_progress" },
  ];

  const checkIns = [{ id: "c1" }, { id: "c2" }, { id: "c3" }] as CheckIn[];

  const day = extractDayFeatures({
    date: "2026-01-01",
    sessionFeatures: [s1, s2, s3],
    tasks,
    checkIns,
  });

  assert.equal(day.totalSessionCount, 3);
  assert.equal(day.totalSessionDurationSeconds, 6600); // 1800 + 3600 + 1200
  assert.equal(day.totalProductiveDurationSeconds, 5100); // 1200 + 3000 + 900
  assert.equal(day.totalDistractionDurationSeconds, 900); // 300 + 600 + 0
  assert.equal(day.totalContextSwitches, 8); // 2 + 5 + 1
  assert.equal(day.longestSessionDurationSeconds, 3600);
  assert.equal(day.averageSessionDurationSeconds, 2200); // 6600 / 3
  assert.equal(day.completedTaskCount, 3);
  assert.equal(day.createdTaskCount, 4);
  assert.equal(day.taskCompletionRate, 0.75);
  assert.equal(day.checkInCount, 3);
});
