import { apiFetch } from "@shared/api/client";
import type { ActivitySummary, DailyAnalytics } from "../types";

export function getActivitySummary(timezone?: string) {
  const tz =
    timezone ??
    (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined);
  const qs = tz ? `?timezone=${encodeURIComponent(tz)}` : "";
  return apiFetch<ActivitySummary>(`/api/activity/summary${qs}`);
}

export function getDailyAnalytics(timezone?: string) {
  const tz =
    timezone ??
    (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined);
  const qs = tz ? `?timezone=${encodeURIComponent(tz)}` : "";
  return apiFetch<DailyAnalytics>(`/api/analytics/daily${qs}`);
}
