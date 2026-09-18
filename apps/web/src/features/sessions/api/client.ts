import { apiFetch, jsonBody } from "@shared/api/client";
import type { WorkSession, CreateSessionInput, UpdateSessionInput, CheckIn, CreateCheckInInput } from "../types";

export function getSessions() {
  return apiFetch<WorkSession[]>("/api/sessions");
}

export function getActiveSession() {
  return apiFetch<WorkSession | null>("/api/sessions/active");
}

export function createSession(input: CreateSessionInput) {
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

export function updateSession(id: string, input: UpdateSessionInput) {
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

export function getCheckIns() {
  return apiFetch<CheckIn[]>("/api/check-ins");
}

export function createCheckIn(input: CreateCheckInInput) {
  return apiFetch<CheckIn>("/api/check-ins", jsonBody(input));
}
