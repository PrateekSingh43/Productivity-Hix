import { apiFetch } from "./client";
import type {
  UserActivityRuleCreateInput,
  UserActivityRuleUpdateInput,
  UserOverrideCreateInput,
} from "@repo/validation";

export interface UserActivityRule {
  id: string;
  userId: string;
  name: string;
  priority: number;
  isEnabled: boolean;
  applicationPattern: string | null;
  domainPattern: string | null;
  titlePattern: string | null;
  urlPattern: string | null;
  assignedModality: string | null;
  assignedContext: string | null;
  defaultRelevance: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserActivityOverride {
  id: string;
  userId: string;
  targetTimeWindowStart: string;
  targetTimeWindowEnd: string;
  targetApplication: string;
  targetClaimFamily: string;
  targetClaimType: string;
  overriddenValue: string;
  reason: string | null;
  createdAt: string;
}

export function getActivityRules(): Promise<{ rules: UserActivityRule[] }> {
  return apiFetch<{ rules: UserActivityRule[] }>("/api/activity-rules/rules");
}

export function createActivityRule(
  data: UserActivityRuleCreateInput
): Promise<{ rule: UserActivityRule }> {
  return apiFetch<{ rule: UserActivityRule }>("/api/activity-rules/rules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateActivityRule(
  id: string,
  data: UserActivityRuleUpdateInput
): Promise<{ rule: UserActivityRule }> {
  return apiFetch<{ rule: UserActivityRule }>(`/api/activity-rules/rules/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
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
    body: JSON.stringify(data),
  });
}

export function deleteActivityOverride(id: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/activity-rules/overrides/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
