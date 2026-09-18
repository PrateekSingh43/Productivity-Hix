"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTask, updateTask, deleteTask } from "./client";
import { taskQueries } from "./queries";
import type { CreateTaskInput, UpdateTaskInput } from "../types";

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useUpdateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) => updateTask(id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
      queryClient.invalidateQueries({ queryKey: taskQueries.detail(variables.id).queryKey });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}
