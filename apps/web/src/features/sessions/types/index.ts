import type { WorkSession, CheckIn, CheckInAmendment } from "@repo/types";

export type { WorkSession, CheckIn, CheckInAmendment };

export interface CreateSessionInput {
  taskId?: string | null;
  targetDurationMinutes?: number | null;
  notes?: string | null;
  startedAt?: string;
}

export interface UpdateSessionInput {
  taskId?: string | null;
  endedAt?: string | null;
  notes?: string | null;
}

export interface CreateCheckInInput {
  workSessionId?: string | null;
  taskId?: string | null;
  intent?: string;
  progress?: boolean;
  productive?: boolean | null;
  blocker?: string | null;
  outcome?: string | null;
  activityAssessment?: string | null;
  energy?: string | null;
  focus?: string | null;
  note?: string | null;
  source?: string;
}

export interface AmendCheckInInput {
  activityAssessment?: string | null;
  alignment?: string | null;
  reasons?: string[];
  state?: string | null;
  energy?: string | null;
  focus?: string | null;
  note?: string | null;
  blocker?: string | null;
  productive?: boolean | null;
  outcome?: string | null;
}

export type SessionRangePreset = "today" | "7d" | "30d" | "90d" | "custom" | "all";

/** Structural session filter: both kinds, task-linked only, or independent only. */
export type SessionLinkedFilter = "all" | "linked" | "independent";

/** History organization: chronological truth, or repeated work grouped by task. */
export type SessionHistoryView = "timeline" | "by-task";

export interface SessionListFilters {
  rangePreset?: SessionRangePreset;
  from?: string;
  to?: string;
  taskId?: string | null;
  /** Server-known values only; the "all" UI state omits the param. */
  linked?: Exclude<SessionLinkedFilter, "all">;
  search?: string;
  limit?: number;
}
