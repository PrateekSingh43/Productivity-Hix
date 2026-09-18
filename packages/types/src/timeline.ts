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
  isAfk?: boolean;
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
  // Canonical semantic modality rollups
  developmentMs?: number;
  readingResearchMs?: number;
  writingDocumentationMs?: number;
  communicationModalityMs?: number;
  mediaConsumptionMs?: number;
  gamingMs?: number;
  idleAwayMs?: number;
  administrationMs?: number;
  unknownMs?: number;
  blocksCount?: number;
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
  /** Phase 3B semantic blocks (observation-backed TemporalActivityBlock projections). */
  blocks?: TimelineBlock[];
}

export interface TimelineClaimEvidence {
  evidenceType: string;
  evidenceReference: string;
  weight: number;
}

export interface TimelineBlockModalityClaim {
  value: string;
  confidence: number | null;
  provenance: string;
  authority: string;
  evidence?: TimelineClaimEvidence[];
}

export interface TimelineBlockContextClaim {
  value: string;
  provenance: string;
  authority?: string;
  evidence?: TimelineClaimEvidence[];
}

export interface TimelineBlockIntentLink {
  targetScope: string;
  taskId: string | null;
  goalId: string | null;
  projectTag: string | null;
  relevance: string;
  intentionRelationship: string;
}

export interface TimelineBlock {
  id: string;
  startTime: string;
  endTime: string;
  wallClockDurationMs: number;
  observedActiveDurationMs: number;
  pausedDurationMs: number;
  track: string;
  primaryApplication: string;
  cleanTitle: string;
  domain: string | null;
  sanitizedUrl: string | null;
  sourceChannel: string;
  rawEventCount: number;
  observationSetFingerprint: string;
  isAfkBlock: boolean;
  activityType?: string | null;
  modality: {
    primary: TimelineBlockModalityClaim | null;
    secondary: Array<{ value: string; provenance: string; authority?: string; evidence?: TimelineClaimEvidence[] }>;
    context: TimelineBlockContextClaim | null;
  };
  intentLink?: TimelineBlockIntentLink | null;
  attention: { focusEvidenceState: string } | null;
  coverageGaps: Array<{ id: string; startTime: string; endTime: string; coverageState: string; reconciliationState: string }>;
  pendingInterpretation: boolean;
}

