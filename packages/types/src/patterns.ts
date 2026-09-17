export type BaselineStrategy =
  | "PERSONAL_30_DAY"
  | "PERSONAL_30_DAY_PERCENTILE"
  | "PERSONAL_HISTORICAL_VARIANCE"
  | "SAME_TASK_TYPE"
  | "SAME_DURATION_CLASS"
  | "ROLLING_14_DAY_WINDOW"
  | "EARLY_SESSION_INTRA_DAY"
  | "NONE";

export type EpisodeExecutionStatus =
  | "QUALIFIED"
  | "NOT_QUALIFIED"
  | "INSUFFICIENT_EVIDENCE"
  | "INDETERMINATE_COVERAGE";

export type PatternExecutionStatus =
  | "DETECTED"
  | "NO_PATTERN"
  | "INSUFFICIENT_EVIDENCE"
  | "INSUFFICIENT_BASELINE_DATA"
  | "INDETERMINATE_COVERAGE";

export interface BaseDetectionMetadata {
  evaluationId: string;
  detectorVersion: string;
  configurationVersion: string;
  generatedAt: string;
}

export interface PatternSufficiency {
  minimumQualifyingEpisodes?: number | null;
  minimumDistinctCalendarDays?: number | null;
  minimumUsableCoverage?: number | null;
  minimumBaselineMaturityDays?: number | null;
  detectorSpecificRecurrenceRequirement?: number | null;

  requiredEvidenceQuality: {
    allowReportedOnly: boolean;
    allowExplainedGap: boolean;
    maxUnknownFraction: number;
  };

  unknownHandling:
    | "INTERRUPT_CONTINUITY"
    | "TERMINATE_EPISODE"
    | "INDETERMINATE_IF_EXCEEDED";
}

export interface PatternReliability {
  tier: "PROVISIONAL" | "LOW" | "MODERATE" | "HIGH";

  calibrationStatus:
    | "UNVALIDATED_PROTOTYPE"
    | "EMPIRICALLY_CALIBRATED";

  evidenceQualityFactors: {
    qualifyingDayCount: number;
    qualifyingEpisodeCount: number;
    meanTelemetryCoverageRatio: number;
    temporalVariability: number | null;
    baselineMaturityDays: number;
    hasCorroboratingSelfReport: boolean;
  };
}

export interface EpisodeMeasurementOutput<
  TMetrics = Record<string, unknown>,
> {
  metadata: BaseDetectionMetadata;

  userId: string;
  detectorIdentity: string;

  taxonomy:
    | "context_dynamics"
    | "schedule_fidelity"
    | "execution_friction"
    | "sustained_effort"
    | "temporal_distribution";

  executionStatus: EpisodeExecutionStatus;

  level: "EPISODE";

  attributionMode:
    | "TASK_LINKED"
    | "GENERAL";

  temporalWindow: {
    start: string;
    end: string;
    scale:
      | "CONTINUOUS_INTERVAL"
      | "TASK_INSTANCE"
      | "INTRA_SESSION";
  };

  episodeEvidence: {
    sessionId?: string;
    taskId?: string;
    boundingWindow: {
      start: string;
      end: string;
    };
  };

  activeDurationSeconds: number;
  coverageRatio: number;

  metrics: TMetrics;

  baselineComparison?: {
    strategy: BaselineStrategy;
    comparedMetric: string;

    baselineValue: number | null;
    percentileRank: number | null;

    comparisonStatus:
      | "EVALUATED"
      | "INSUFFICIENT_BASELINE_DATA"
      | "NOT_APPLICABLE"
      | "UNDEFINED_ZERO_BASELINE";
  };

  epistemicCaveats: string[];
}

export type PatternRepertoireCategory =
  | "strength"
  | "stable"
  | "emerging"
  | "changed"
  | "friction"
  | "mismatch"
  | "opportunity";

export type PatternClaimLevel = "recurrence" | "sustained-change" | "co-occurrence";

export interface AnalyticalWindow {
  start: string;
  end: string;
}

export interface PatternEvidenceRef {
  occasionId: string;
  date: string;
  window: AnalyticalWindow;
  blockIds: string[];
  sessionIds: string[];
  taskIds: string[];
  reportIds: string[];
}

export interface PatternLayerFields {
  claim: string;
  claimLevel: PatternClaimLevel;
  repertoireCategory: PatternRepertoireCategory;
  comparison: {
    referenceKind: "own-history" | "declared-intention";
    window: AnalyticalWindow;
    comparabilityNote: string;
  };
  eligibility: {
    required: Record<string, number | string>;
    observed: Record<string, number | string>;
    excluded: Array<{ occasionId: string; reason: string }>;
  };
  contributingResults: Array<{
    detectorIdentity: string;
    resultId: string;
    metricsUsed: string[];
    role: "primary" | "supporting";
  }>;
  evidenceRefs: PatternEvidenceRef[];
  caveats: string[];
  headline?: string;
  supportingLine?: string;
  evidenceAnchor?: string;
}

export interface BehavioralPatternOutput<
  TMetrics = Record<string, unknown>,
> extends Partial<PatternLayerFields> {
  metadata: BaseDetectionMetadata & {
    patternId: string;
  };

  userId: string;
  patternType: string;

  taxonomy:
    | "context_dynamics"
    | "schedule_fidelity"
    | "execution_friction"
    | "sustained_effort"
    | "temporal_distribution";

  executionStatus: PatternExecutionStatus;

  level: "PATTERN";

  attributionMode:
    | "TASK_LINKED"
    | "GENERAL";

  temporalWindow: {
    start: string;
    end: string;
    scale:
      | "INTRA_DAY"
      | "7_DAY"
      | "14_DAY"
      | "30_DAY";
  };

  sample: {
    qualifyingDays: number;
    qualifyingEpisodes: number;
    totalObservedHours: number;
    meanCoverageRatio: number;

    populationCounts?: {
      scheduledTaskCount?: number;
      observedStartTaskCount?: number;
      notObservedTaskCount?: number;
      indeterminateStartTaskCount?: number;
      delayedStartTaskCount?: number;
    };
  };

  baseline: {
    strategy: BaselineStrategy;
    comparedMetric: string;

    baselineValue: number | null;
    currentValue: number | null;
    deltaRatio: number | null;

    comparisonStatus:
      | "EVALUATED"
      | "INSUFFICIENT_BASELINE_DATA"
      | "NOT_APPLICABLE"
      | "UNDEFINED_ZERO_BASELINE";
  };

  metrics: TMetrics;

  reliability: PatternReliability;

  evidenceReferences: {
    contributingSessionIds?: string[];
    contributingTaskIds?: string[];

    sampleBoundingWindows: Array<{
      start: string;
      end: string;
    }>;
  };

  epistemicCaveats: string[];
}

export type QualifiedBehavioralPatternOutput<TMetrics = Record<string, unknown>> =
  BehavioralPatternOutput<TMetrics> & PatternLayerFields;

export type InsightClaimLevel =
  | "co-occurrence"
  | "contrast"
  | "pattern-outcome-association";

export type InsightInputRef =
  | { patternId: string; role: "primary" | "supporting" }
  | { observationRef: string; role: "primary" | "supporting" };

export interface InsightOutput {
  inputs: InsightInputRef[];
  personalElements: Array<{
    kind: "intention" | "reflection" | "outcome" | "retention";
    recordId: string;
  }>;
  claim: string;
  claimLevel: InsightClaimLevel;
  alternatives: string[];
  doesNotEstablish: string[];
  evidenceRefs: PatternEvidenceRef[];
  status: "DETECTED" | "NO_INSIGHT" | "INSUFFICIENT_EVIDENCE";
  window: AnalyticalWindow;
  reliability: PatternReliability | null;
  headline?: string;
  supportingLine?: string;
  hypothesis?: {
    adjustment: string;
    intendedBenefit: string;
    potentialCost: string;
    reviewAfter: string;
  };
}

export interface PatternEvaluationLogEntry {
  auditId: string;
  evaluationId: string;

  userId: string;
  detectorIdentity: string;

  supersededAt: string;

  supersessionCause:
    | "NEW_TELEMETRY_ARRIVED"
    | "TASK_LINK_MODIFIED"
    | "BASELINE_RECOMPUTED"
    | "DETECTOR_VERSION_BUMP"
    | "CONFIG_VERSION_BUMP"
    | "RETROSPECTIVE_EDIT";

  triggeringEntityIds: string[];

  previousGeneratedAt: string;

  previousExecutionStatus:
    | EpisodeExecutionStatus
    | PatternExecutionStatus;

  previousMetrics: Record<string, unknown>;

  previousBaselineComparison?:
    | Record<string, unknown>
    | null;

  previousReliabilityTier?: string | null;

  previousResultSnapshot: Record<string, unknown>;
}
