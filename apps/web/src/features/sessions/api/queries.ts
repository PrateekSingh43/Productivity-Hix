"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { getSessions, getActiveSession } from "./client";

export const sessionQueries = {
  all: () => ["sessions"] as const,
  lists: () => [...sessionQueries.all(), "list"] as const,
  list: () =>
    queryOptions({
      queryKey: sessionQueries.lists(),
      queryFn: getSessions,
      staleTime: 5_000,
      refetchInterval: 5_000,
    }),
  active: () =>
    queryOptions({
      queryKey: [...sessionQueries.all(), "active"] as const,
      queryFn: getActiveSession,
      staleTime: 2_000,
      refetchInterval: 3_000,
    }),
};

export function useSessionsList() {
  return useQuery(sessionQueries.list());
}

export function useActiveSession() {
  return useQuery(sessionQueries.active());
}
