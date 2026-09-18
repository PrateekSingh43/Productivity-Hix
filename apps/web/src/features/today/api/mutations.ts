"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DailyPlanUpsertInput } from "@repo/validation";
import type { GoalOutcome } from "@repo/types";
import { upsertPlan, updateGoalOutcome, deleteGoal } from "./client";
import { planQueries } from "./queries";
import { taskQueries } from "@features/tasks/api/queries";

export function useSavePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: DailyPlanUpsertInput) => upsertPlan(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: planQueries.all() });
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
      queryClient.setQueryData([...planQueries.all(), "today", result.date], result);
    },
  });
}

export function useUpdateGoalOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ goalId, outcome }: { goalId: string; outcome: GoalOutcome | null }) =>
      updateGoalOutcome(goalId, outcome),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planQueries.all() });
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (goalId: string) => deleteGoal(goalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planQueries.all() });
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
    },
  });
}
