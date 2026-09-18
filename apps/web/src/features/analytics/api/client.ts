import { apiFetch } from "@shared/api/client";
import type { AnalyticsPeriod, PatternsResponse, InsightsResponse } from "../types";

export function getPatterns({ from, to }: AnalyticsPeriod) {
  return apiFetch<PatternsResponse>(`/api/patterns?${new URLSearchParams({ from, to })}`);
}

export function getInsights({ from, to }: AnalyticsPeriod) {
  return apiFetch<InsightsResponse>(`/api/insights?${new URLSearchParams({ from, to })}`);
}
