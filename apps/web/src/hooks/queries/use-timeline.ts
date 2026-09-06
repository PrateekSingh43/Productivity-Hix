"use client";

import { useQuery } from "@tanstack/react-query";
import { getTimeline } from "../../lib/api";

export function useTimeline(date?: string) {
  return useQuery({
    queryKey: ["activity", "timeline", date],
    queryFn: () => {
      const timezone = typeof window !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC";
      return getTimeline(date, timezone);
    },
    staleTime: 10_000,
  });
}
