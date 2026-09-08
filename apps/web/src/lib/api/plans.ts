import type { DailyGoal, DayPlanResponse, GoalOutcome } from "@repo/types";
import type { DailyPlanUpsertInput } from "@repo/validation";
import { apiFetch, jsonBody } from "./client";

export function getTodayPlan(date?: string, options?: { timezone?: string; boundary?: string }): Promise<DayPlanResponse> {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (options?.timezone) params.set("timezone", options.timezone);
  if (options?.boundary) params.set("boundary", options.boundary);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<DayPlanResponse>(`/api/plans/today${query}`);
}

export function getTomorrowPlan(options?: { timezone?: string; boundary?: string }): Promise<DayPlanResponse> {
  const params = new URLSearchParams();
  if (options?.timezone) params.set("timezone", options.timezone);
  if (options?.boundary) params.set("boundary", options.boundary);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<DayPlanResponse>(`/api/plans/tomorrow${query}`);
}

export function getPlan(date: string): Promise<DayPlanResponse> {
  return apiFetch<DayPlanResponse>(`/api/plans/${date}`);
}

export function upsertPlan(data: DailyPlanUpsertInput): Promise<DayPlanResponse> {
  return apiFetch<DayPlanResponse>("/api/plans", jsonBody(data));
}

export function updateGoalOutcome(goalId: string, outcome: GoalOutcome | null): Promise<DailyGoal> {
  return apiFetch<DailyGoal>(`/api/plans/goals/${goalId}/outcome`, {
    ...jsonBody({ outcome }),
    method: "PATCH",
  });
}

export function deleteGoal(goalId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/api/plans/goals/${goalId}`, {
    method: "DELETE",
  });
}
