import type { ActivitySummary, ProductivityPattern } from "@repo/types";
import { apiFetch } from "./client";

export type DailyAnalytics = {
  date: string;
  activity: ActivitySummary;
  taskCompletionRate: number;
  checkIns: number;
  patterns: ProductivityPattern[];
};
export function getDailyAnalytics(timezone?: string) {
  const tz =
    timezone ??
    (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined);
  const qs = tz ? `?timezone=${encodeURIComponent(tz)}` : "";
  return apiFetch<DailyAnalytics>(`/api/analytics/daily${qs}`);
}
