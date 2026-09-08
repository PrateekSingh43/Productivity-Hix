import type { Task, TaskStatus, WorkSession } from "@repo/types";

export interface TaskFeatures {
  taskId: string;
  status: TaskStatus;
  plannedDurationMinutes: number;
  actualLinkedSessionDurationSeconds: number | null;
  completed: boolean;
  timeToCompletionSeconds: number | null;
}

/**
 * Extracts canonical task-level features.
 * Note: Automatic session attribution remains deferred; linked sessions must be explicitly provided.
 */
export function extractTaskFeatures(task: Task, linkedSessions: WorkSession[] = []): TaskFeatures {
  const completed = task.status === "done";

  // Calculate completion time if completed and both timestamps are valid
  let timeToCompletionSeconds: number | null = null;
  if (completed && task.completedAt && task.createdAt) {
    const createdMs = Date.parse(task.createdAt);
    const completedMs = Date.parse(task.completedAt);
    if (!Number.isNaN(createdMs) && !Number.isNaN(completedMs) && completedMs >= createdMs) {
      timeToCompletionSeconds = Math.round((completedMs - createdMs) / 1000);
    }
  }

  // Linked session duration: only available if sessions are explicitly linked (no heuristics)
  let actualLinkedSessionDurationSeconds: number | null = null;
  const directlyLinked = linkedSessions.filter(
    (s) => s.taskId === task.id && typeof s.durationSeconds === "number" && s.durationSeconds >= 0,
  );

  if (directlyLinked.length > 0) {
    actualLinkedSessionDurationSeconds = directlyLinked.reduce(
      (sum, s) => sum + (s.durationSeconds ?? 0),
      0,
    );
  }

  return {
    taskId: task.id,
    status: task.status,
    plannedDurationMinutes: task.plannedDurationMinutes ?? 0,
    actualLinkedSessionDurationSeconds,
    completed,
    timeToCompletionSeconds,
  };
}
