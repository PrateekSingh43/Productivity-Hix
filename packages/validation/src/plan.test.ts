import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyPlanUpsertSchema, goalSubTaskInputSchema } from "./plan";

test("dailyPlanUpsertSchema validates string subtasks for backwards compatibility", () => {
  const result = dailyPlanUpsertSchema.parse({
    date: "2026-09-26",
    goals: [
      {
        title: "Finish Physics assignment",
        order: 0,
        newTasks: ["Read chapter 4", "Solve problems 1-10"],
      },
    ],
  });

  assert.equal(result.goals[0]?.title, "Finish Physics assignment");
  assert.equal(result.goals[0]?.newTasks?.length, 2);
  assert.equal(result.goals[0]?.newTasks?.[0], "Read chapter 4");
});

test("dailyPlanUpsertSchema validates rich subtask objects with timer duration and due date", () => {
  const result = dailyPlanUpsertSchema.parse({
    date: "2026-09-26",
    goals: [
      {
        title: "Build auth feature",
        order: 0,
        newTasks: [
          {
            title: "Setup OAuth endpoints",
            plannedDurationMinutes: 60,
            dueAt: "2026-09-26T18:00:00.000Z",
            productiveDate: "2026-09-26",
            priority: "high",
          },
          {
            title: "Write unit tests",
            plannedDurationMinutes: 45,
          },
        ],
      },
    ],
  });

  assert.equal(result.goals[0]?.newTasks?.length, 2);
  const task1 = result.goals[0]?.newTasks?.[0] as any;
  assert.equal(task1.title, "Setup OAuth endpoints");
  assert.equal(task1.plannedDurationMinutes, 60);
  assert.equal(task1.priority, "high");

  const task2 = result.goals[0]?.newTasks?.[1] as any;
  assert.equal(task2.title, "Write unit tests");
  assert.equal(task2.plannedDurationMinutes, 45);
  assert.equal(task2.priority, "medium"); // default
});
