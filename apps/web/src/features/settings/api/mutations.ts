"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createActivityRule,
  updateActivityRule,
  deleteActivityRule,
  createActivityOverride,
  deleteActivityOverride,
} from "./client";
import { settingsQueries } from "./queries";
import { timelineQueries } from "@features/timeline";
import type {
  UserActivityRuleCreateInput,
  UserActivityRuleUpdateInput,
  UserOverrideCreateInput,
} from "../types";

export function useCreateActivityRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UserActivityRuleCreateInput) => createActivityRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueries.rules().queryKey });
      queryClient.invalidateQueries({ queryKey: timelineQueries.all() });
    },
  });
}

export function useUpdateActivityRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserActivityRuleUpdateInput }) =>
      updateActivityRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueries.rules().queryKey });
      queryClient.invalidateQueries({ queryKey: timelineQueries.all() });
    },
  });
}

export function useDeleteActivityRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteActivityRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueries.rules().queryKey });
      queryClient.invalidateQueries({ queryKey: timelineQueries.all() });
    },
  });
}

export function useCreateActivityOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UserOverrideCreateInput) => createActivityOverride(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueries.overrides().queryKey });
      queryClient.invalidateQueries({ queryKey: timelineQueries.all() });
    },
  });
}

export function useDeleteActivityOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteActivityOverride(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueries.overrides().queryKey });
      queryClient.invalidateQueries({ queryKey: timelineQueries.all() });
    },
  });
}
