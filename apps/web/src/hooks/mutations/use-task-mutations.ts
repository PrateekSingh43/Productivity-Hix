"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTask,
  updateTask,
  deleteTask,
  createSession,
  pauseSession,
  resumeSession,
  finishSession,
  deleteSession,
} from "../../lib/api";
import type { TaskPriority, TaskStatus } from "@repo/types";

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      description?: string | null;
      priority?: TaskPriority;
      plannedDurationMinutes?: number;
      dueAt?: string | null;
      goalId?: string | null;
      productiveDate?: string | null;
    }) => createTask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useUpdateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: {
        title?: string;
        description?: string | null;
        status?: TaskStatus;
        priority?: TaskPriority;
        plannedDurationMinutes?: number;
        dueAt?: string | null;
        goalId?: string | null;
        productiveDate?: string | null;
      };
    }) => updateTask(id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useStartTaskSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: string | { taskId: string; targetDurationMinutes?: number }) => {
      const taskId = typeof payload === "string" ? payload : payload.taskId;
      const targetDurationMinutes = typeof payload === "object" ? payload.targetDurationMinutes : undefined;
      return createSession({
        taskId,
        targetDurationMinutes,
        notes: "Work session started from Tasks",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

export function useEndTaskSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => finishSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}

export function usePauseSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => pauseSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useResumeSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => resumeSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useDeleteSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}
