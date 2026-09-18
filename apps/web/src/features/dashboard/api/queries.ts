"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { getActivitySummary, getDailyAnalytics } from "./client";

export const dashboardQueries = {
  all: () => ["dashboard"] as const,
  activitySummary: (timezone?: string) =>
    queryOptions({
      queryKey: ["activity", "summary", "today", timezone ?? "default"] as const,
      queryFn: () => getActivitySummary(timezone),
      staleTime: 10_000,
      refetchInterval: 15_000,
    }),
  dailyAnalytics: (timezone?: string) =>
    queryOptions({
      queryKey: ["analytics", "daily", timezone ?? "default"] as const,
      queryFn: () => getDailyAnalytics(timezone),
      staleTime: 30_000,
    }),
};

export function useActivitySummary(timezone?: string) {
  return useQuery(dashboardQueries.activitySummary(timezone));
}

export function useDailyAnalytics(timezone?: string) {
  return useQuery(dashboardQueries.dailyAnalytics(timezone));
}
