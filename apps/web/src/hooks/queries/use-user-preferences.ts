"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UserPreferences } from "@repo/types";
import type { UserPreferencesUpdateInput } from "@repo/validation";
import { getUserPreferences, updateUserPreferences } from "../../lib/api";

export function useUserPreferences() {
  return useQuery({
    queryKey: ["user", "preferences"],
    queryFn: getUserPreferences,
    staleTime: 30_000,
  });
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UserPreferencesUpdateInput) => updateUserPreferences(data),
    onMutate: async (newPrefs) => {
      await queryClient.cancelQueries({ queryKey: ["user", "preferences"] });
      const previous = queryClient.getQueryData<UserPreferences>(["user", "preferences"]);
      if (previous) {
        queryClient.setQueryData<UserPreferences>(["user", "preferences"], {
          ...previous,
          ...newPrefs,
        });
      }
      return { previous };
    },
    onError: (_err, _newPrefs, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["user", "preferences"], context.previous);
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["user", "preferences"], updated);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["user", "preferences"] });
      void queryClient.invalidateQueries({ queryKey: ["plans"] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}
