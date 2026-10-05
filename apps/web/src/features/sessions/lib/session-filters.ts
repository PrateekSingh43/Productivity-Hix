import type {
  SessionLinkedFilter,
  SessionListFilters,
  SessionRangePreset,
} from "../types";
import {
  resolveSessionDateRange,
  type SessionDatePreset,
} from "./date-range";

export interface SessionFilterInput {
  rangePreset: SessionRangePreset;
  selectedTaskId: string;
  linkedFilter: SessionLinkedFilter;
  searchQuery: string;
  customFrom: string;
  customTo: string;
  timezone?: string;
  boundary?: string;
  now?: Date;
}

export const DEFAULT_SESSION_FILTERS: Omit<
  SessionFilterInput,
  "timezone" | "boundary" | "now"
> = {
  rangePreset: "30d",
  selectedTaskId: "all",
  linkedFilter: "all",
  searchQuery: "",
  customFrom: "",
  customTo: "",
};

/**
 * Builds the server query from explicit filter state.
 *
 * Date math delegates entirely to the canonical productive-day resolver
 * (lib/date-range.ts): presets and custom ranges share one semantic, and
 * `to` is always sent so windows are half-open [from, to), never
 * open-ended "last N days plus everything since".
 */
export function resolveSessionFilters(input: SessionFilterInput): SessionListFilters {
  const datePreset: SessionDatePreset =
    input.rangePreset === "custom" ? "custom" : input.rangePreset;
  const range = resolveSessionDateRange(datePreset, {
    timezone: input.timezone,
    boundary: input.boundary,
    now: input.now,
    customFrom: input.customFrom || undefined,
    customTo: input.customTo || undefined,
  });

  const filters: SessionListFilters = {
    rangePreset: input.rangePreset,
    limit: input.rangePreset === "all" ? 500 : 200,
  };
  if (range.from) filters.from = range.from;
  if (range.to) filters.to = range.to;
  if (input.selectedTaskId !== "all") filters.taskId = input.selectedTaskId;
  if (input.linkedFilter !== "all") {
    filters.linked = input.linkedFilter;
  }
  if (input.searchQuery.trim()) filters.search = input.searchQuery.trim();
  return filters;
}

/** Reset is visible only when state differs from the page defaults. */
export function sessionFiltersDifferFromDefaults(
  input: Pick<
    SessionFilterInput,
    "rangePreset" | "selectedTaskId" | "linkedFilter" | "searchQuery" | "customFrom" | "customTo"
  >,
): boolean {
  return (
    input.rangePreset !== DEFAULT_SESSION_FILTERS.rangePreset ||
    input.selectedTaskId !== DEFAULT_SESSION_FILTERS.selectedTaskId ||
    input.linkedFilter !== DEFAULT_SESSION_FILTERS.linkedFilter ||
    input.searchQuery.trim().length > 0 ||
    input.customFrom !== "" ||
    input.customTo !== ""
  );
}
