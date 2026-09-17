import { apiFetch } from "./client";
import type { AnalyticsPeriod, PatternsResponse } from "./analytics";

export function getPatterns({ from, to }: AnalyticsPeriod) {
  return apiFetch<PatternsResponse>(`/api/patterns?${new URLSearchParams({ from, to })}`);
}
