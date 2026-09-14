import { describe, it } from "node:test";
import assert from "node:assert";
import { PrismaTaskDataSource } from "./prisma-task-data-source";
import type { Database } from "@repo/db";

describe("Baseline: PrismaTaskDataSource", () => {
  it("should query Prisma with correct temporal bounds and map results canonically", async () => {
    let capturedWhere: any = null;
    let capturedInclude: any = null;

    const mockDb = {
      task: {
        findMany: async (args: any) => {
          capturedWhere = args.where;
          capturedInclude = args.include;
          return [
            {
              id: "task-1",
              userId: "user-1",
              title: "Task 1",
              description: "Desc",
              status: "done",
              priority: "high",
              plannedDurationMinutes: 45,
              dueAt: new Date("2023-01-05T00:00:00Z"),
              completedAt: new Date("2023-01-05T10:00:00Z"),
              goalId: "goal-1",
              productiveDate: "2023-01-05",
              createdAt: new Date("2023-01-01T10:00:00Z"),
              updatedAt: new Date("2023-01-05T10:00:00Z"),
              sessions: [
                {
                  id: "sess-1",
                  startedAt: new Date("2023-01-05T08:00:00Z"),
                  endedAt: new Date("2023-01-05T09:00:00Z"),
                  durationSeconds: 3600,
                  isPaused: false,
                  lastResumedAt: null,
                  notes: "Focus",
                }
              ],
              checkIns: [
                {
                  id: "chk-1",
                  activityAssessment: "productive",
                  alignment: "yes",
                  energy: "high",
                  focus: "high",
                  note: "Good",
                  outcome: "done",
                  blocker: null,
                  createdAt: new Date("2023-01-05T09:00:00Z"),
                }
              ]
            }
          ];
        }
      }
    } as unknown as Database;

    const source = new PrismaTaskDataSource(mockDb);
    const result = await source.fetchUserTasks("user-1", "2023-01-01T00:00:00Z", "2023-01-10T00:00:00Z");

    // 1. Verify query semantics
    assert.ok(capturedWhere);
    assert.strictEqual(capturedWhere.userId, "user-1");
    assert.strictEqual(capturedWhere.completedAt.gte.toISOString(), "2023-01-01T00:00:00.000Z");
    assert.strictEqual(capturedWhere.completedAt.lt.toISOString(), "2023-01-10T00:00:00.000Z");

    // 2. Verify mapping
    assert.strictEqual(result.length, 1);
    const task = result[0];
    assert.strictEqual(task.id, "task-1");
    assert.strictEqual(task.priority, "high");
    assert.strictEqual(task.sessions.length, 1);
    assert.strictEqual(task.sessions[0].durationSeconds, 3600);
    assert.strictEqual(task.checkIns!.length, 1);
    assert.strictEqual(task.checkIns![0].energy, "high");
  });
});
