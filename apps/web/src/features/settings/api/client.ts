import { apiFetch, jsonBody } from "@shared/api/client";
import type {
  UserPreferences,
  UserPreferencesUpdateInput,
  UserActivityRule,
  UserActivityOverride,
  UserActivityRuleCreateInput,
  UserActivityRuleUpdateInput,
  UserOverrideCreateInput,
} from "../types";

export function getUserPreferences(): Promise<UserPreferences> {
  return apiFetch<UserPreferences>("/api/user/preferences");
}

export function updateUserPreferences(
  data: UserPreferencesUpdateInput
): Promise<UserPreferences> {
  return apiFetch<UserPreferences>("/api/user/preferences", {
    method: "PATCH",
    ...jsonBody(data),
  });
}

export function getActivityRules(): Promise<{ rules: UserActivityRule[] }> {
  return apiFetch<{ rules: UserActivityRule[] }>("/api/activity-rules/rules");
}

export function createActivityRule(
  data: UserActivityRuleCreateInput
): Promise<{ rule: UserActivityRule }> {
  return apiFetch<{ rule: UserActivityRule }>("/api/activity-rules/rules", {
    method: "POST",
    ...jsonBody(data),
  });
}

export function updateActivityRule(
  id: string,
  data: UserActivityRuleUpdateInput
): Promise<{ rule: UserActivityRule }> {
  return apiFetch<{ rule: UserActivityRule }>(`/api/activity-rules/rules/${encodeURIComponent(id)}`, {
    method: "PATCH",
    ...jsonBody(data),
  });
}

export function deleteActivityRule(id: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/activity-rules/rules/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function getActivityOverrides(): Promise<{ overrides: UserActivityOverride[] }> {
  return apiFetch<{ overrides: UserActivityOverride[] }>("/api/activity-rules/overrides");
}

export function createActivityOverride(
  data: UserOverrideCreateInput
): Promise<{ override: UserActivityOverride }> {
  return apiFetch<{ override: UserActivityOverride }>("/api/activity-rules/overrides", {
    method: "POST",
    ...jsonBody(data),
  });
}

export function deleteActivityOverride(id: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/activity-rules/overrides/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function exportTelemetry() {
  return apiFetch<unknown>("/api/export/telemetry");
}
