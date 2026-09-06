"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCheckIn } from "../../lib/api";

export function useCreateCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCheckIn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analytics"] }),
  });
}
