"use client";

import { useQuery } from "@tanstack/react-query";
import { getActivitySummary, getDailyAnalytics, getTasks } from "../../lib/api";

export function useTasks() {
  return useQuery({ queryKey: ["tasks"], queryFn: getTasks });
}
export function useActivitySummary() {
  return useQuery({ queryKey: ["activity", "summary", "today"], queryFn: getActivitySummary });
}
export function useDailyAnalytics() {
  return useQuery({ queryKey: ["analytics", "daily"], queryFn: getDailyAnalytics });
}

export { useTimeline } from "./use-timeline";
