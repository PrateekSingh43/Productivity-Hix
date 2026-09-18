import { apiFetch, jsonBody } from "@shared/api/client";
import type { Task, TaskWithSessions, TaskObservedActivityItem, CreateTaskInput, UpdateTaskInput } from "../types";

export function getTasks() {
  return apiFetch<Task[]>("/api/tasks");
}

export function getTask(id: string) {
  return apiFetch<TaskWithSessions>(`/api/tasks/${id}`);
}

export function getTaskObservedActivity(id: string) {
  return apiFetch<TaskObservedActivityItem[]>(`/api/tasks/${id}/activity`);
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
