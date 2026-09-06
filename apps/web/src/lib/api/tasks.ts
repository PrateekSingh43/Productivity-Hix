import type { Task, TaskWithSessions } from "@repo/types";
import { apiFetch, jsonBody } from "./client";

export function getTasks() {
  return apiFetch<Task[]>("/api/tasks");
}

export function getTask(id: string) {
  return apiFetch<TaskWithSessions>(`/api/tasks/${id}`);
}

export function getTaskObservedActivity(id: string) {
  return apiFetch<Array<{ application: string; durationSeconds: number }>>(`/api/tasks/${id}/activity`);
}

export function createTask(input: {
  title: string;
  description?: string | null;
  priority?: "none" | "low" | "medium" | "high";
  plannedDurationMinutes?: number;
  dueAt?: string | null;
}) {
  return apiFetch<Task>("/api/tasks", jsonBody(input));
}

export function updateTask(
  id: string,
  input: {
    title?: string;
    description?: string | null;
    status?: "todo" | "in_progress" | "done" | "cancelled";
    priority?: "none" | "low" | "medium" | "high";
    plannedDurationMinutes?: number;
    dueAt?: string | null;
  },
) {
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
