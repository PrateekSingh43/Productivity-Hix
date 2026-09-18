"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { getPatterns, getInsights } from "./client";
import type { AnalyticsPeriod } from "../types";

export const analyticsQueries = {
  all: () => ["analytics"] as const,
  patterns: (period: AnalyticsPeriod) =>
    queryOptions({
      queryKey: [...analyticsQueries.all(), "patterns", period.from, period.to] as const,
      queryFn: () => getPatterns(period),
      staleTime: 60_000,
    }),
  insights: (period: AnalyticsPeriod) =>
    queryOptions({
      queryKey: [...analyticsQueries.all(), "insights", period.from, period.to] as const,
      queryFn: () => getInsights(period),
      staleTime: 60_000,
    }),
};

export function usePatterns(period: AnalyticsPeriod) {
  return useQuery(analyticsQueries.patterns(period));
}

export function useInsights(period: AnalyticsPeriod) {
  return useQuery(analyticsQueries.insights(period));
}
