import { describe, it } from "node:test";
import assert from "node:assert";
import type { TaskWithSessions } from "@repo/types";
import { CompletedTasksAdapter, type TaskDataSource } from "./completed-tasks-adapter";
import type { HistoricalWindow } from "../source";
import { evaluateBaseline } from "../engine";
import { median } from "../statistics";

describe("Baseline: CompletedTasksAdapter (Integration)", () => {
  const dummyTasks: TaskWithSessions[] = [
    {
      id: "task_userA_1",
      userId: "userA",
      title: "User A Task 1",
      description: null,
      status: "done",
      priority: "medium",
      plannedDurationMinutes: 30,
      dueAt: null,
      completedAt: "2023-01-05T10:00:00Z",
      createdAt: "2023-01-01T00:00:00Z",
      updatedAt: "2023-01-05T10:00:00Z",
      sessions: [],
    },
    {
      id: "task_userA_2",
      userId: "userA",
      title: "User A Task 2 (Boundary edge)",
      description: null,
      status: "done",
      priority: "medium",
      plannedDurationMinutes: 30,
      dueAt: null,
      completedAt: "2023-01-10T00:00:00Z", // Exactly at window.end (should be excluded)
      createdAt: "2023-01-01T00:00:00Z",
      updatedAt: "2023-01-10T00:00:00Z",
      sessions: [],
    },
    {
      id: "task_userB_1",
      userId: "userB", // Different user
      title: "User B Task 1",
      description: null,
      status: "done",
      priority: "medium",
      plannedDurationMinutes: 30,
      dueAt: null,
      completedAt: "2023-01-05T10:00:00Z",
      createdAt: "2023-01-01T00:00:00Z",
      updatedAt: "2023-01-05T10:00:00Z",
      sessions: [],
    }
  ];

  class MockTaskDataSource implements TaskDataSource {
    async findCompletedTasks(userId: string, startUTC: string, endUTC: string): Promise<TaskWithSessions[]> {
      const startMs = Date.parse(startUTC);
      const endMs = Date.parse(endUTC);

      return dummyTasks.filter((task) => {
        // Enforce user isolation
        if (task.userId !== userId) return false;

        // Enforce half-open boundary [start, end)
        if (!task.completedAt) return false;
        const completedMs = Date.parse(task.completedAt);
        return completedMs >= startMs && completedMs < endMs;
      });
    }
  }

  it("should prove user isolation and half-open boundary [start, end)", async () => {
    const dataSource = new MockTaskDataSource();
    const provider = new CompletedTasksAdapter(dataSource);

    const window: HistoricalWindow = {
      start: "2023-01-01T00:00:00Z",
      end: "2023-01-10T00:00:00Z", // Excludes tasks completed EXACTLY at 2023-01-10T00:00:00Z
    };
    const evalStart = "2023-01-10T00:00:00Z";

    // Fetch for userA
    const populationA = await provider.fetchPopulation("userA", window);

    // Should only contain userA's task 1. 
    // userA's task 2 is excluded because completedAt === window.end.
    // userB's task is excluded by user isolation.
    assert.strictEqual(populationA.length, 1);
    assert.strictEqual(populationA[0]!.id, "task_userA_1");

    // Pass through engine
    const result = evaluateBaseline(populationA, window, evalStart, {
      populationType: provider.populationType,
      metricName: "task_count",
      strategy: "median",
      qualifier: () => true,
      metricExtractor: () => 1,
      aggregator: median,
    });

    assert.strictEqual(result.status, "VALID");
    assert.strictEqual(result.qualifiedPopulationCount, 1);
    assert.strictEqual(result.aggregatedValue, 1);
  });
});
