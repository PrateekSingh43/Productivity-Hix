"use client";

import { useEffect, useRef } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTimeline } from "./client";
import { useLiveTelemetry } from "../hooks/use-live-telemetry";

export const timelineQueries = {
  all: () => ["activity", "timeline"] as const,
  day: (date?: string) => {
    const isToday = !date || date === new Date().toLocaleDateString("en-CA");
    return queryOptions({
      queryKey: [...timelineQueries.all(), date] as const,
      queryFn: () => {
        const timezone =
          typeof window !== "undefined"
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : "UTC";
        return getTimeline(date, timezone);
      },
      staleTime: isToday ? 15_000 : 5 * 60_000,
      refetchInterval: isToday ? 30_000 : false,
    });
  },
};

export function useTimeline(date?: string) {
  const isToday = !date || date === new Date().toLocaleDateString("en-CA");
  const queryClient = useQueryClient();
  const live = useLiveTelemetry();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isToday || !live.connected || live.eventCount === 0) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: timelineQueries.all() });
    }, 5000);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isToday, live.eventCount, live.connected, queryClient]);

  return useQuery(timelineQueries.day(date));
}
