import type {
  NormalizedActivityEvent,
  TimelineSegment,
  CheckIn,
  WorkSession,
  Task,
  UserGapExplanation,
  DailyGoal,
  WorkContext,
  AttributionCorrection,
  EvidenceTimeline,
  TemporalEvidenceBlock,
  EvidenceCoverageState,
  EvidenceProvenance,
  EvidenceProvenanceRole,
  ObservationEvidence,
  ReportEvidence,
  IntentionEvidence,
  OutcomeEvidence,
} from "@repo/types";

export interface BuildEvidenceOptions {
  windowStart: string | Date | number;
  windowEnd: string | Date | number;
  events?: NormalizedActivityEvent[];
  segments?: TimelineSegment[];
  checkIns?: CheckIn[];
  gapExplanations?: UserGapExplanation[];
  sessions?: WorkSession[];
  tasks?: Task[];
  goals?: DailyGoal[];
  /** Phase 1 (R7): work contexts act as IP-address-like attribution signals. */
  workContexts?: WorkContext[];
  /** Phase 1 (R1): user corrections override all other attribution signals. */
  corrections?: AttributionCorrection[];
}

export type {
  EvidenceTimeline,
  TemporalEvidenceBlock,
  EvidenceCoverageState,
  EvidenceProvenance,
  EvidenceProvenanceRole,
  ObservationEvidence,
  ReportEvidence,
  IntentionEvidence,
  OutcomeEvidence,
};
