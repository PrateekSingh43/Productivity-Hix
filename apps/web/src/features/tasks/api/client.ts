import { apiFetch, jsonBody } from "@shared/api/client";
import type { Task, TaskWithSessions, TaskObservedActivityItem, TaskScheduleMove, TaskEvidenceResponse, CreateTaskInput, UpdateTaskInput, TaskFilters } from "../types";

export function getTasks(filters?: TaskFilters) {
  const params = new URLSearchParams();
  if (filters?.productiveDate) params.set("productiveDate", filters.productiveDate);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.goalId) params.set("goalId", filters.goalId);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return apiFetch<Task[]>(`/api/tasks${suffix}`);
}

export function getTask(id: string) {
  return apiFetch<TaskWithSessions>(`/api/tasks/${id}`);
}

export function getTaskObservedActivity(id: string) {
  return apiFetch<TaskObservedActivityItem[]>(`/api/tasks/${id}/activity`);
}

export function getTaskScheduleHistory(id: string) {
  return apiFetch<TaskScheduleMove[]>(`/api/tasks/${id}/schedule-history`);
}

export function getTaskEvidence(id: string, from: Date, to: Date) {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return apiFetch<TaskEvidenceResponse>(`/api/tasks/${id}/evidence?${params.toString()}`);
}

export function createTask(input: CreateTaskInput) {
  return apiFetch<Task>("/api/tasks", jsonBody(input));
}

export function updateTask(id: string, input: UpdateTaskInput) {
  return apiFetch<Task>(`/api/tasks/${id}`, {
    ...jsonBody(input),
    method: "PATCH",
  });
}

export function deleteTask(id: string) {
  return apiFetch<{ success: boolean }>(`/api/tasks/${id}`, {
    method: "DELETE",
  });
}
