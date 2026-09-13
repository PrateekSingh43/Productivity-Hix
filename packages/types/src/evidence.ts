import type { TimelineCategory } from "./timeline";
import type { TargetScope } from "./semantic-timeline";

/**
 * Core Evidence Coverage State
 * Defined by strict precedence:
 * 1. Telemetry covers interval:
 *    - User report also covers: OBSERVED_REPORTED
 *    - No user report: OBSERVED
 * 2. Telemetry does NOT cover interval:
 *    - User report covers & specifically explains missing telemetry: EXPLAINED_GAP
 *    - User report covers (e.g. check-in reflection): REPORTED
 *    - No user report: UNKNOWN
 */
export type EvidenceCoverageState =
  | "OBSERVED"
  | "REPORTED"
  | "OBSERVED_REPORTED"
  | "UNKNOWN"
  | "EXPLAINED_GAP";

export type EvidenceAuthority = "SYSTEM" | "USER";

export interface EvidenceProvenance {
  source: string;
  collector?: string;
  authority: EvidenceAuthority;
  confidence?: number | null;
}

export interface ObservationEvidence {
  application: string;
  title: string;
  cleanTitle: string;
  domain?: string | null;
  sanitizedUrl?: string | null;
  category: TimelineCategory;
  isAfk: boolean;
  rawEventCount: number;
}

export interface ReportEvidence {
  source: "CHECK_IN" | "GAP_EXPLANATION";
  reportingWindow: {
    start: string;
    end: string;
  };
  assessment?: string | null;
  alignment?: string | null;
  energy?: string | null;
  focus?: string | null;
  note?: string | null;
  reasons?: string[];
  gapReason?: string | null;
  offlineWorkContext?: string | null;
  authority: "USER";
}

export type IntentionLinkType = "EXPLICIT" | "INFERRED" | "UNKNOWN";

export interface IntentionEvidence {
  targetScope: TargetScope;
  taskId?: string | null;
  taskTitle?: string | null;
  goalId?: string | null;
  goalTitle?: string | null;
  linkType: IntentionLinkType;
  confidence?: number | null;
}

export interface OutcomeEvidence {
  taskId?: string | null;
  taskStatus?: string | null;
  taskCompletedAt?: string | null;
  goalId?: string | null;
  goalOutcome?: string | null;
}

export interface TemporalEvidenceBlock {
  id: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  durationSeconds: number;
  coverage: EvidenceCoverageState;
  provenance: EvidenceProvenance[];
  observation: ObservationEvidence | null;
  report: ReportEvidence | null;
  intention: IntentionEvidence | null;
  outcome: OutcomeEvidence | null;
}

export interface EvidenceCoverageSummary {
  totalDurationSeconds: number;
  observedSeconds: number;
  reportedSeconds: number;
  observedReportedSeconds: number;
  unknownSeconds: number;
  explainedGapSeconds: number;
  coverageRatio: number; // 0.0 to 1.0 (proportion accounted for: 1 - unknown/total)
}

export interface EvidenceTimeline {
  windowStart: string;
  windowEnd: string;
  totalDurationSeconds: number;
  blocks: TemporalEvidenceBlock[];
  coverageSummary: EvidenceCoverageSummary;
}
