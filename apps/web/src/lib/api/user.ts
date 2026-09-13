import type { UserPreferences } from "@repo/types";
import type { UserPreferencesUpdateInput } from "@repo/validation";
import { apiFetch } from "./client";

export async function getUserPreferences(): Promise<UserPreferences> {
  return apiFetch<UserPreferences>("/api/user/preferences");
}

export async function updateUserPreferences(
  data: UserPreferencesUpdateInput,
): Promise<UserPreferences> {
  return apiFetch<UserPreferences>("/api/user/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
