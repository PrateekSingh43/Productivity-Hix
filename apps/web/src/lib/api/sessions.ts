import type { WorkSession } from "@repo/types";
import { apiFetch, jsonBody } from "./client";

export function getSessions() {
  return apiFetch<WorkSession[]>("/api/sessions");
}

export function getActiveSession() {
  return apiFetch<WorkSession | null>("/api/sessions/active");
}

export function createSession(input: {
  taskId?: string | null;
  targetDurationMinutes?: number | null;
  notes?: string | null;
  startedAt?: string;
}) {
  return apiFetch<WorkSession>("/api/sessions", jsonBody(input));
}

export function pauseSession(id: string) {
  return apiFetch<WorkSession>(`/api/sessions/${id}/pause`, {
    method: "POST",
  });
}

export function resumeSession(id: string) {
  return apiFetch<WorkSession>(`/api/sessions/${id}/resume`, {
    method: "POST",
  });
}

export function updateSession(id: string, input: { taskId?: string | null; endedAt?: string | null; notes?: string | null }) {
  return apiFetch<WorkSession>(`/api/sessions/${id}`, {
    ...jsonBody(input),
    method: "PATCH",
  });
}

export function finishSession(id: string, notes?: string | null) {
  return updateSession(id, {
    endedAt: new Date().toISOString(),
    notes,
  });
}

export function deleteSession(id: string) {
  return apiFetch<{ success: boolean }>(`/api/sessions/${id}`, {
    method: "DELETE",
  });
}
