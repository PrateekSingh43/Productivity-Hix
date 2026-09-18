import type { Task, TaskPriority, TaskStatus, TaskWithSessions, TaskObservedActivityItem } from "@repo/types";

export type { Task, TaskPriority, TaskStatus, TaskWithSessions, TaskObservedActivityItem };

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
