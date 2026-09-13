"use client";

import { useQuery } from "@tanstack/react-query";
import { getTimeline } from "../../lib/api";

export function useTimeline(date?: string) {
  const isToday = !date || date === new Date().toLocaleDateString("en-CA");

  return useQuery({
    queryKey: ["activity", "timeline", date],
    queryFn: () => {
      const timezone = typeof window !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC";
      return getTimeline(date, timezone);
    },
    // Past days are immutable historical data, cache them for 5 minutes
    // Today updates periodically in background
    staleTime: isToday ? 30_000 : 5 * 60_000,
    refetchInterval: isToday ? 30_000 : false,
  });
}
