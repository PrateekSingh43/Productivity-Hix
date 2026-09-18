"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getTimeline } from "../../lib/api";
import { useLiveTelemetry } from "../use-live-telemetry";

export function useTimeline(date?: string) {
  const isToday = !date || date === new Date().toLocaleDateString("en-CA");
  const queryClient = useQueryClient();
  const live = useLiveTelemetry();
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isToday || !live.connected || live.eventCount === 0) return;

    // Debounce invalidation to avoid spamming the backend during high event density
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["activity", "timeline"] });
    }, 5000);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isToday, live.eventCount, live.connected, queryClient]);

  return useQuery({
    queryKey: ["activity", "timeline", date],
    queryFn: () => {
      const timezone =
        typeof window !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : "UTC";
      return getTimeline(date, timezone);
    },
    // Past days are immutable historical data, cache them for 5 minutes
    // Today updates periodically or on live telemetry
    staleTime: isToday ? 15_000 : 5 * 60_000,
    refetchInterval: isToday ? 30_000 : false,
  });
}

