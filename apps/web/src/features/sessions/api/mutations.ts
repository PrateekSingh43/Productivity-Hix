"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createSession,
  pauseSession,
  resumeSession,
  finishSession,
  deleteSession,
  createCheckIn,
  amendCheckIn,
} from "./client";
import { sessionQueries } from "./queries";
import { taskQueries } from "@features/tasks/api/queries";
import type { AmendCheckInInput, CreateCheckInInput, CreateSessionInput } from "../types";

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

/**
 * Late-entry debrief for a past session (or any fresh reflection).
 * Blast radius: task lists (drawer counts), task detail (reflections list),
 * sessions list, analytics/check-ins caches.
 */
export function useCreateCheckInMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCheckInInput) => createCheckIn(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
      queryClient.invalidateQueries({ queryKey: taskQueries.details() });
      queryClient.invalidateQueries({ queryKey: sessionQueries.all() });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["check-ins"] });
    },
  });
}

/**
 * Amendment of an existing reflection (original preserved server-side).
 * Same invalidation blast radius as creation.
 */
export function useAmendCheckInMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AmendCheckInInput }) =>
      amendCheckIn(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
      queryClient.invalidateQueries({ queryKey: taskQueries.details() });
      queryClient.invalidateQueries({ queryKey: sessionQueries.all() });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["check-ins"] });
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
