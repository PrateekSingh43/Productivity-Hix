// apps/web/src/features/sessions/lib/session-filters.ts
import type { SessionListFilters, SessionRangePreset } from "../types";

export function resolveSessionFilters(
  rangePreset: SessionRangePreset,
  selectedTaskId: string,
  searchQuery: string,
  now: Date = new Date(),
): SessionListFilters {
  const filters: SessionListFilters = {
    rangePreset,
    limit: rangePreset === "all" ? 500 : 200,
  };
  if (selectedTaskId !== "all") filters.taskId = selectedTaskId;
  if (searchQuery.trim()) filters.search = searchQuery.trim();
  if (rangePreset === "today") {
    filters.from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
  } else if (rangePreset === "7d") {
    filters.from = new Date(now.getTime() - 7 * 86400000).toISOString();
  } else if (rangePreset === "30d") {
    filters.from = new Date(now.getTime() - 30 * 86400000).toISOString();
  } else if (rangePreset === "90d") {
    filters.from = new Date(now.getTime() - 90 * 86400000).toISOString();
  }
  return filters;
}
