import { apiFetch, jsonBody } from "@shared/api/client";
import type {
  WorkSession,
  CreateSessionInput,
  UpdateSessionInput,
  CheckIn,
  CheckInAmendment,
  CreateCheckInInput,
  AmendCheckInInput,
  SessionListFilters,
} from "../types";

export function getSessions(filters?: SessionListFilters) {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.taskId) params.set("taskId", filters.taskId);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.limit) params.set("limit", String(filters.limit));
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<WorkSession[]>(`/api/sessions${query}`);
}

export function getActiveSession() {
  return apiFetch<WorkSession | null>("/api/sessions/active");
}

function notifyExtensionSessionUpdate(action: "start" | "pause" | "resume" | "end", session?: WorkSession | null) {
  if (typeof window !== "undefined") {
    try {
      window.postMessage({ type: "PRODUCTIVEHIX_SESSION_UPDATE", action, session }, "*");
    } catch {}
  }
}

export async function createSession(input: CreateSessionInput) {
  const session = await apiFetch<WorkSession>("/api/sessions", jsonBody(input));
  notifyExtensionSessionUpdate("start", session);
  return session;
}

export async function pauseSession(id: string) {
  const session = await apiFetch<WorkSession>(`/api/sessions/${id}/pause`, {
    method: "POST",
  });
  notifyExtensionSessionUpdate("pause", session);
  return session;
}

export async function resumeSession(id: string) {
  const session = await apiFetch<WorkSession>(`/api/sessions/${id}/resume`, {
    method: "POST",
  });
  notifyExtensionSessionUpdate("resume", session);
  return session;
}

export async function updateSession(id: string, input: UpdateSessionInput) {
  const session = await apiFetch<WorkSession>(`/api/sessions/${id}`, {
    ...jsonBody(input),
    method: "PATCH",
  });
  if (input.endedAt) {
    notifyExtensionSessionUpdate("end", session);
  }
  return session;
}

export function finishSession(id: string, notes?: string | null) {
  return updateSession(id, {
    endedAt: new Date().toISOString(),
    notes,
  });
}

export async function deleteSession(id: string) {
  const res = await apiFetch<{ success: boolean }>(`/api/sessions/${id}`, {
    method: "DELETE",
  });
  notifyExtensionSessionUpdate("end", null);
  return res;
}

export function getCheckIns() {
  return apiFetch<CheckIn[]>("/api/check-ins");
}

export function createCheckIn(input: CreateCheckInInput) {
  return apiFetch<CheckIn>("/api/check-ins", jsonBody(input));
}

export function amendCheckIn(id: string, input: AmendCheckInInput) {
  return apiFetch<CheckIn>(`/api/check-ins/${id}`, {
    ...jsonBody(input),
    method: "PATCH",
  });
}

export function getCheckInAmendments(id: string) {
  return apiFetch<CheckInAmendment[]>(`/api/check-ins/${id}/amendments`);
}
