"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createSession,
  pauseSession,
  resumeSession,
  finishSession,
  deleteSession,
} from "./client";
import { sessionQueries } from "./queries";
import { taskQueries } from "@features/tasks/api/queries";
import type { CreateSessionInput } from "../types";

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
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
      queryClient.invalidateQueries({ queryKey: sessionQueries.all() });
    },
  });
}

export function useEndTaskSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => finishSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
      queryClient.invalidateQueries({ queryKey: sessionQueries.all() });
    },
  });
}

export function usePauseSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => pauseSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionQueries.all() });
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
    },
  });
}

export function useResumeSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => resumeSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionQueries.all() });
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
    },
  });
}

export function useDeleteSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
      queryClient.invalidateQueries({ queryKey: sessionQueries.all() });
    },
  });
}
