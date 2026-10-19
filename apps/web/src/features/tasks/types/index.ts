import type { Task, TaskPriority, TaskStatus, TaskWithSessions, TaskObservedActivityItem, TaskScheduleMove, EvidenceTimeline } from "@repo/types";

export type { Task, TaskPriority, TaskStatus, TaskWithSessions, TaskObservedActivityItem, TaskScheduleMove };

export interface TaskEvidenceFreshness {
  computedAt: string;
  windowStart: string;
  windowEnd: string;
  telemetryThrough: string | null;
  inputs: {
    activityEvents: number;
    sessions: number;
    workContexts: number;
    corrections: number;
    checkIns: number;
    gapExplanations: number;
  };
}

/** Slice C: task evidence read model with per-request freshness (R3). */
export interface TaskEvidenceResponse {
  taskId: string;
  taskTitle: string;
  evidence: EvidenceTimeline;
  freshness: TaskEvidenceFreshness;
}

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  goalId?: string;
  productiveDate?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  plannedDurationMinutes?: number;
  dueAt?: string | null;
  goalId?: string | null;
  productiveDate?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  plannedDurationMinutes?: number;
  dueAt?: string | null;
  goalId?: string | null;
  productiveDate?: string | null;
}
