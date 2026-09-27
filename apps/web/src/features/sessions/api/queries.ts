"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { getSessions, getActiveSession, getCheckInAmendments } from "./client";
import type { SessionListFilters } from "../types";

export const sessionQueries = {
  all: () => ["sessions"] as const,
  lists: () => [...sessionQueries.all(), "list"] as const,
  list: (filters?: SessionListFilters) =>
    queryOptions({
      queryKey: [...sessionQueries.lists(), filters ?? {}] as const,
      queryFn: () => getSessions(filters),
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
  checkIns: () => [...sessionQueries.all(), "check-ins"] as const,
  amendments: (checkInId: string | null) =>
    queryOptions({
      queryKey: [...sessionQueries.checkIns(), checkInId, "amendments"] as const,
      queryFn: () => (checkInId ? getCheckInAmendments(checkInId) : []),
      enabled: Boolean(checkInId),
      staleTime: 10_000,
    }),
};

export function useSessionsList(filters?: SessionListFilters) {
  return useQuery(sessionQueries.list(filters));
}

export function useActiveSession() {
  return useQuery(sessionQueries.active());
}

export function useCheckInAmendments(checkInId: string | null) {
  return useQuery(sessionQueries.amendments(checkInId));
}
