"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { DailyPlanUpsertInput } from "@repo/validation";
import type { GoalOutcome } from "@repo/types";
import { resolveProductiveDay, resolveTomorrowProductiveDay } from "@repo/types";
import {
  getTodayPlan,
  getTomorrowPlan,
  getPlan,
  upsertPlan,
  updateGoalOutcome,
  deleteGoal,
} from "../../lib/api/plans";

export function useTodayPlan(date?: string) {
  const timezone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
  const localDate = date ?? resolveProductiveDay(new Date(), { timezone });

  return useQuery({
    queryKey: ["plans", "today", localDate],
    queryFn: () => getTodayPlan(localDate, { timezone }),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

export function useTomorrowPlan() {
  const timezone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

  return useQuery({
    queryKey: ["plans", "tomorrow"],
    queryFn: () => getTomorrowPlan({ timezone }),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function usePlan(date: string) {
  return useQuery({
    queryKey: ["plans", "by-date", date],
    queryFn: () => getPlan(date),
    enabled: Boolean(date),
  });
}

export function useSavePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DailyPlanUpsertInput) => upsertPlan(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.setQueryData(["plans", "today", result.date], result);
    },
  });
}

export function useUpdateGoalOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ goalId, outcome }: { goalId: string; outcome: GoalOutcome | null }) =>
      updateGoalOutcome(goalId, outcome),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (goalId: string) => deleteGoal(goalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
