import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getActivityRules,
  createActivityRule,
  updateActivityRule,
  deleteActivityRule,
  getActivityOverrides,
  createActivityOverride,
  deleteActivityOverride,
  type UserActivityRule,
  type UserActivityOverride,
} from "../../lib/api/rules";
import type {
  UserActivityRuleCreateInput,
  UserActivityRuleUpdateInput,
  UserOverrideCreateInput,
} from "@repo/validation";

export function useActivityRules() {
  return useQuery({
    queryKey: ["activity-rules", "rules"],
    queryFn: getActivityRules,
  });
}

export function useActivityOverrides() {
  return useQuery({
    queryKey: ["activity-rules", "overrides"],
    queryFn: getActivityOverrides,
  });
}

export function useCreateActivityRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UserActivityRuleCreateInput) => createActivityRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-rules", "rules"] });
      queryClient.invalidateQueries({ queryKey: ["activity", "timeline"] });
    },
  });
}

export function useUpdateActivityRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserActivityRuleUpdateInput }) =>
      updateActivityRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-rules", "rules"] });
      queryClient.invalidateQueries({ queryKey: ["activity", "timeline"] });
    },
  });
}

export function useDeleteActivityRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteActivityRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-rules", "rules"] });
      queryClient.invalidateQueries({ queryKey: ["activity", "timeline"] });
    },
  });
}

export function useCreateActivityOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UserOverrideCreateInput) => createActivityOverride(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-rules", "overrides"] });
      queryClient.invalidateQueries({ queryKey: ["activity", "timeline"] });
    },
  });
}

export function useDeleteActivityOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteActivityOverride(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-rules", "overrides"] });
      queryClient.invalidateQueries({ queryKey: ["activity", "timeline"] });
    },
  });
}
