"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { getTasks, getTask, getTaskObservedActivity } from "./client";
import type { TaskFilters } from "../types";

export const taskQueries = {
  all: () => ["tasks"] as const,
  lists: () => [...taskQueries.all(), "list"] as const,
  list: (filters?: TaskFilters) =>
    queryOptions({
      queryKey: [...taskQueries.lists(), filters ?? {}] as const,
      queryFn: getTasks,
      staleTime: 5_000,
      refetchInterval: 10_000,
    }),
  details: () => [...taskQueries.all(), "detail"] as const,
  detail: (id: string | null) =>
    queryOptions({
      queryKey: [...taskQueries.details(), id] as const,
      queryFn: () => (id ? getTask(id) : null),
      enabled: Boolean(id),
      staleTime: 10_000,
    }),
  activities: () => [...taskQueries.all(), "activity"] as const,
  activity: (id: string | null) =>
    queryOptions({
      queryKey: [...taskQueries.activities(), id] as const,
      queryFn: () => (id ? getTaskObservedActivity(id) : []),
      enabled: Boolean(id),
      staleTime: 10_000,
    }),
};

export function useTasksList(filters?: TaskFilters) {
  return useQuery(taskQueries.list(filters));
}

export function useTaskDetail(taskId: string | null) {
  return useQuery(taskQueries.detail(taskId));
}

export function useTaskActivity(taskId: string | null) {
  return useQuery(taskQueries.activity(taskId));
}
