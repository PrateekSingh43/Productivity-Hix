import { apiFetch } from "./client";
import type { AnalyticsPeriod, InsightsResponse } from "./analytics";

export function getInsights({ from, to }: AnalyticsPeriod) {
  return apiFetch<InsightsResponse>(`/api/insights?${new URLSearchParams({ from, to })}`);
}
