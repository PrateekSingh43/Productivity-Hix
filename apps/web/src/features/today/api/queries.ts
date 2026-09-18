"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { resolveProductiveDay } from "@repo/types";
import { getTodayPlan, getTomorrowPlan, getPlan } from "./client";

export const planQueries = {
  all: () => ["plans"] as const,
  today: (date?: string) => {
    const timezone =
      typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
    const localDate = date ?? resolveProductiveDay(new Date(), { timezone });
    return queryOptions({
      queryKey: [...planQueries.all(), "today", localDate] as const,
      queryFn: () => getTodayPlan(localDate, { timezone }),
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    });
  },
  tomorrow: () => {
    const timezone =
      typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
    return queryOptions({
      queryKey: [...planQueries.all(), "tomorrow"] as const,
      queryFn: () => getTomorrowPlan({ timezone }),
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    });
  },
  byDate: (date: string) =>
    queryOptions({
      queryKey: [...planQueries.all(), "by-date", date] as const,
      queryFn: () => getPlan(date),
      enabled: Boolean(date),
      staleTime: 30_000,
    }),
};

export function useTodayPlan(date?: string) {
  return useQuery(planQueries.today(date));
}

export function useTomorrowPlan() {
  return useQuery(planQueries.tomorrow());
}

export function usePlan(date: string) {
  return useQuery(planQueries.byDate(date));
}
