import type {
  NormalizedActivityEvent,
  TimelineSegment,
  CheckIn,
  WorkSession,
  Task,
  UserGapExplanation,
  DailyGoal,
  EvidenceTimeline,
  TemporalEvidenceBlock,
  EvidenceCoverageState,
  EvidenceProvenance,
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
}

export type {
  EvidenceTimeline,
  TemporalEvidenceBlock,
  EvidenceCoverageState,
  EvidenceProvenance,
  ObservationEvidence,
  ReportEvidence,
  IntentionEvidence,
  OutcomeEvidence,
};
