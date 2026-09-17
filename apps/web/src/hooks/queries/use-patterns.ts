"use client";

import { useQuery } from "@tanstack/react-query";
import { getPatterns } from "../../lib/api/patterns";
import type { AnalyticsPeriod } from "../../lib/api/analytics";

export function usePatterns(period: AnalyticsPeriod) {
  return useQuery({
    queryKey: ["patterns", period.from, period.to],
    queryFn: () => getPatterns(period),
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });
}
