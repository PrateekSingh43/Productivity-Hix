"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getPatterns, getInsights, requestPatternAnalysis } from "./client";
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

export function useRequestPatternAnalysis(period: AnalyticsPeriod) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => requestPatternAnalysis(period),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: analyticsQueries.patterns(period).queryKey });
    },
  });
}
