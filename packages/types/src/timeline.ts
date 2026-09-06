export type TimelineCategory =
  | "focused"
  | "browser"
  | "leisure"
  | "break"
  | "communication"
  | "general";

export interface TimelineAppShare {
  name: string;
  durationMs: number;
}

export interface TimelineSegment {
  id: string;
  start: string;
  end: string;
  durationMs: number;
  durationSeconds: number;
  source: "desktop" | "browser" | "unknown";
  type: "application" | "browser" | "break";
  activityType?: "application" | "browser" | "break";
  application: string;
  title: string;
  primaryTitle?: string;
  /** Human-scale row title, e.g. "Browser — ProductiveHix / Research". */
  displayTitle?: string;
  domain?: string;
  category: TimelineCategory;
  rawEventCount?: number;
  contexts?: string[];
  /** Collapsed AFK/idle time absorbed inside this block. */
  pausedMs?: number;
  /** Gap before this block that was too short to be its own break row. */
  precedingGapMs?: number;
  applications?: TimelineAppShare[];
}

export interface TimelineSummary {
  totalTrackedMs: number;
  focusedMs: number;
  browserMs: number;
  leisureMs: number;
  breakMs: number;
  communicationMs: number;
  generalMs: number;
  segmentsCount: number;
}

export interface CurrentActivityState {
  isActive: boolean;
  application: string | null;
  title: string | null;
  domain?: string | null;
  startedAt: string | null;
  runningForSeconds: number | null;
  category: TimelineCategory;
  isAfk: boolean;
}

export interface TimelineResponse {
  date: string;
  timezone: string;
  totalDurationMs: number;
  summary: TimelineSummary;
  currentActivity: CurrentActivityState | null;
  segments: TimelineSegment[];
}
