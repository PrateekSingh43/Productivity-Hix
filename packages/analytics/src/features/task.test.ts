import { strict as assert } from "node:assert";
import { test } from "node:test";
import { extractTaskFeatures } from "./task";
import type { Task, WorkSession } from "@repo/types";

const mockTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  userId: "user-1",
  title: "Implement feature",
  description: "Details",
  status: "todo",
  priority: "medium",
  plannedDurationMinutes: 45,
  dueAt: null,
  completedAt: null,
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-01T10:00:00.000Z",
  ...overrides,
});

test("task features: incomplete task with planned duration and no linked sessions", () => {
  const task = mockTask({ status: "in_progress", plannedDurationMinutes: 60 });
  const features = extractTaskFeatures(task);

  assert.equal(features.taskId, "task-1");
  assert.equal(features.status, "in_progress");
  assert.equal(features.plannedDurationMinutes, 60);
  assert.equal(features.completed, false);
  assert.equal(features.timeToCompletionSeconds, null, "Incomplete task has no completion time");
  assert.equal(features.actualLinkedSessionDurationSeconds, null, "No linked sessions -> null (not zero)");
});

test("task features: completed task calculates timeToCompletionSeconds", () => {
  const task = mockTask({
    status: "done",
    createdAt: "2026-01-01T10:00:00.000Z",
    completedAt: "2026-01-01T10:45:00.000Z", // 45 minutes = 2700s
  });
  const features = extractTaskFeatures(task);

  assert.equal(features.completed, true);
  assert.equal(features.timeToCompletionSeconds, 2700);
});

test("task features: task with explicitly linked sessions computes linked duration", () => {
  const task = mockTask({ id: "task-linked", status: "done" });
  const sessions: WorkSession[] = [
    {
      id: "s1",
      taskId: "task-linked",
      startedAt: "2026-01-01T10:00:00.000Z",
      endedAt: "2026-01-01T10:30:00.000Z",
      durationSeconds: 1800,
      source: "manual",
    },
    {
      id: "s2",
      taskId: "other-task",
      startedAt: "2026-01-01T11:00:00.000Z",
      endedAt: "2026-01-01T11:30:00.000Z",
      durationSeconds: 1800,
      source: "manual",
    },
  ];

  const features = extractTaskFeatures(task, sessions);
  assert.equal(features.actualLinkedSessionDurationSeconds, 1800);
});

test("task features: missing task attribution (derived sessions have taskId = null) produces null duration", () => {
  const task = mockTask({ id: "task-unattributed" });
  // Derived sessions have taskId = null (deferred attribution)
  const sessions: WorkSession[] = [
    {
      id: "s-derived",
      taskId: null,
      startedAt: "2026-01-01T10:00:00.000Z",
      endedAt: "2026-01-01T10:30:00.000Z",
      durationSeconds: 1800,
      source: "derived",
    },
  ];

  const features = extractTaskFeatures(task, sessions);
  assert.equal(
    features.actualLinkedSessionDurationSeconds,
    null,
    "Unassigned derived sessions do not heuristically attribute duration",
  );
});
