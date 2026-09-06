import type { ActivitySummary, ProductivityPattern } from "@repo/types";
import { apiFetch } from "./client";

export type DailyAnalytics = {
  date: string;
  activity: ActivitySummary;
  taskCompletionRate: number;
  checkIns: number;
  patterns: ProductivityPattern[];
};
export function getDailyAnalytics() {
  return apiFetch<DailyAnalytics>("/api/analytics/daily");
}
