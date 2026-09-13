import type { ActivitySummary, TimelineResponse } from "@repo/types";
import { apiFetch } from "./client";

export function getActivitySummary(timezone?: string) {
  const tz =
    timezone ??
    (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined);
  const qs = tz ? `?timezone=${encodeURIComponent(tz)}` : "";
  return apiFetch<ActivitySummary>(`/api/activity/summary${qs}`);
}

export function syncActivity() {
  return apiFetch<{ imported: number }>("/api/activity/sync", { method: "POST" });
}

export function getTimeline(date?: string, timezone?: string) {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (timezone) params.set("timezone", timezone);
  const qs = params.toString();
  return apiFetch<TimelineResponse>(`/api/activity/timeline${qs ? `?${qs}` : ""}`);
}
