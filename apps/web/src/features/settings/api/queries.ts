"use client";

import { queryOptions, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserPreferences, UserPreferencesUpdateInput } from "../types";
import {
  getUserPreferences,
  updateUserPreferences,
  getActivityRules,
  getActivityOverrides,
} from "./client";
import { planQueries } from "@features/today";
import { timelineQueries } from "@features/timeline";

export const settingsQueries = {
  all: () => ["settings"] as const,
  preferences: () =>
    queryOptions({
      queryKey: ["user", "preferences"] as const,
      queryFn: getUserPreferences,
      staleTime: 30_000,
    }),
  rules: () =>
    queryOptions({
      queryKey: ["activity-rules", "rules"] as const,
      queryFn: getActivityRules,
      staleTime: 10_000,
    }),
  overrides: () =>
    queryOptions({
      queryKey: ["activity-rules", "overrides"] as const,
      queryFn: getActivityOverrides,
      staleTime: 10_000,
    }),
};

export function useUserPreferences() {
  return useQuery(settingsQueries.preferences());
}

export function useActivityRules() {
  return useQuery(settingsQueries.rules());
}

export function useActivityOverrides() {
  return useQuery(settingsQueries.overrides());
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UserPreferencesUpdateInput) => updateUserPreferences(data),
    onMutate: async (newPrefs) => {
      await queryClient.cancelQueries({ queryKey: settingsQueries.preferences().queryKey });
      const previous = queryClient.getQueryData<UserPreferences>(
        settingsQueries.preferences().queryKey
      );
      if (previous) {
        queryClient.setQueryData<UserPreferences>(settingsQueries.preferences().queryKey, {
          ...previous,
          ...newPrefs,
        });
      }
      return { previous };
    },
    onError: (_err, _newPrefs, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsQueries.preferences().queryKey, context.previous);
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(settingsQueries.preferences().queryKey, updated);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsQueries.preferences().queryKey });
      void queryClient.invalidateQueries({ queryKey: planQueries.all() });
      void queryClient.invalidateQueries({ queryKey: timelineQueries.all() });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}
