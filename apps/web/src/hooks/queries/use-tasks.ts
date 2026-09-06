"use client";

import { useQuery } from "@tanstack/react-query";
import { getTasks, getTask, getTaskObservedActivity, getSessions } from "../../lib/api";

export function useTasksList() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: getTasks,
    staleTime: 5_000,
    refetchInterval: 10_000, // keep active sessions in sync
  });
}

export function useTaskDetail(taskId: string | null) {
  return useQuery({
    queryKey: ["tasks", taskId],
    queryFn: () => (taskId ? getTask(taskId) : null),
    enabled: Boolean(taskId),
  });
}

export function useTaskActivity(taskId: string | null) {
  return useQuery({
    queryKey: ["tasks", taskId, "activity"],
    queryFn: () => (taskId ? getTaskObservedActivity(taskId) : []),
    enabled: Boolean(taskId),
  });
}

export function useSessionsList() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}
