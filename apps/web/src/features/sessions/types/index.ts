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

export type SessionRangePreset = "today" | "7d" | "30d" | "90d" | "all";

export interface SessionListFilters {
  rangePreset?: SessionRangePreset;
  from?: string;
  to?: string;
  taskId?: string | null;
  search?: string;
  limit?: number;
}
