import type { ActivitySummary, ProductivityPattern } from "@repo/types";

export type AnalyticsState =
  | "not-connected"
  | "no-observations"
  | "insufficient-evidence"
  | "no-findings"
  | "pending"
  | "ok";

export interface AnalyticsPeriod {
  from: string;
  to: string;
}

export interface AnalyticsWindow {
  start: string;
  end: string;
}

export interface AnalyticsEvidenceRef {
  occasionId: string;
  date: string;
  window: AnalyticsWindow;
  blockIds: string[];
  sessionIds: string[];
  taskIds: string[];
  reportIds: string[];
}

export type RepertoireCategory =
  | "strength"
  | "stable"
  | "emerging"
  | "changed"
  | "friction"
  | "mismatch"
  | "opportunity";

export interface BehavioralPatternOutput {
  id?: string;
  metadata?: { patternId: string };
  claim?: string;
  headline?: string;
  supportingLine?: string;
  evidenceAnchor?: string;
  claimLevel: "recurrence" | "sustained-change" | "co-occurrence";
  repertoireCategory: RepertoireCategory;
  comparison: {
    referenceKind: string;
    window: AnalyticsWindow;
    comparabilityNote: string;
  };
  eligibility: {
    required: Record<string, number | string>;
    observed: Record<string, number | string>;
    excluded: { occasionId: string; reason: string }[];
  };
  contributingResults: {
    detectorIdentity: string;
    resultId: string;
    metricsUsed: string[];
    role: "primary" | "supporting";
    gloss?: string;
  }[];
  evidenceRefs: AnalyticsEvidenceRef[];
  caveats: string[];
  reliability: unknown;
}

export interface InsightOutput {
  id?: string;
  claim: string;
  claimLevel: "co-occurrence" | "contrast" | "pattern-outcome-association";
  supportingLine?: string;
  inputs: {
    patternId?: string;
    observationRef?: string;
    role: "primary" | "supporting";
  }[];
  personalElements: {
    kind: "intention" | "reflection" | "outcome" | "retention";
    recordId: string;
  }[];
  alternatives: string[];
  doesNotEstablish: string[];
  evidenceRefs: AnalyticsEvidenceRef[];
  reliability: unknown;
  status?: "DETECTED" | "NO_INSIGHT" | "INSUFFICIENT_EVIDENCE";
  window?: AnalyticsWindow;
  hypothesis?: {
    adjustment: string;
    intendedBenefit: string;
    potentialCost: string;
    reviewAfter: string;
  };
}

export interface AnalyticsDiagnostics {
  perDetector: { identity: string; status: string; reason?: string; availability?: "AVAILABLE" | "NOT_AVAILABLE" }[];
  observationCount?: number;
  recordingHistory?: {
    firstObservationAt: string | null;
    lastObservationAt: string | null;
    recordedDays: number;
    connected: boolean;
  };
}

export type RecordingHistory = NonNullable<AnalyticsDiagnostics["recordingHistory"]>;

export interface AnalyticsResponse {
  state: AnalyticsState;
  window?: AnalyticsPeriod;
  diagnostics?: AnalyticsDiagnostics;
  observationCount?: number;
}

export interface PatternsResponse extends AnalyticsResponse {
  window: AnalyticsPeriod;
  patterns: BehavioralPatternOutput[];
}

export interface InsightsResponse extends AnalyticsResponse {
  insights: InsightOutput[];
}

export type { ActivitySummary, ProductivityPattern };
