"use client";

import { useQuery } from "@tanstack/react-query";
import { getInsights } from "../../lib/api/insights";
import type { AnalyticsPeriod } from "../../lib/api/analytics";

export function useInsights(period: AnalyticsPeriod) {
  return useQuery({
    queryKey: ["insights", period.from, period.to],
    queryFn: () => getInsights(period),
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });
}
