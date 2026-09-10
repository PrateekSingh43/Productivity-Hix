/**
 * Phase 2 & 3A: Canonical Semantic Timeline & Data Architecture Types
 * Source of truth: docs/productivehix/timeline/PHASE-2-DOMAIN-MODEL-SEMANTIC-DATA-ARCHITECTURE.md
 */

// ============================================================================
// 1. Domain Enums
// ============================================================================

export type ActivityModality =
  | 'development'
  | 'reading_research'
  | 'writing_documentation'
  | 'communication'
  | 'administration'
  | 'media_consumption'
  | 'gaming'
  | 'idle_away'
  | 'system_maintenance'
  | 'unknown';

export type ClaimType =
  | 'MODALITY_PRIMARY'
  | 'MODALITY_SECONDARY'
  | 'TOPIC_CONTEXT'
  | 'INFERRED_BEHAVIOR';

export type ClaimProvenance =
  | 'SENSOR_OBSERVED'
  | 'USER_RULE'
  | 'USER_OVERRIDE'
  | 'ACTIVE_SESSION_AFFINITY'
  | 'CONTEXT_HEURISTIC'
  | 'INFERRED';

export type ClaimAuthority = 'SYSTEM' | 'USER';

export type TargetScope =
  | 'TASK'
  | 'GOAL'
  | 'PROJECT'
  | 'GENERAL_WORK'
  | 'UNLINKED';

export type ContextRelevance =
  | 'DIRECT'
  | 'SUPPORTIVE'
  | 'TANGENTIAL'
  | 'UNRELATED'
  | 'UNKNOWN';

export type IntentionRelationship =
  | 'ALIGNED'
  | 'DIVERGENT'
  | 'UNLINKED'
  | 'UNKNOWN';

export type FocusEvidenceState =
  | 'UNKNOWN'
  | 'INSUFFICIENT'
  | 'SUPPORTED'
  | 'CONTRADICTORY';

export type TrackType =
  | 'FOREGROUND'
  | 'AMBIENT_AUDIO'
  | 'BACKGROUND_PROCESS';

export type CoverageState =
  | 'SYSTEM_SLEEP'
  | 'POWER_OFF'
  | 'COLLECTOR_DISCONNECTED'
  | 'SENSOR_AFK'
  | 'UNKNOWN_SILENCE';

export type ReconciliationState =
  | 'UNEXPLAINED'
  | 'PENDING_PROMPT'
  | 'EXPLAINED'
  | 'DISMISSED';

export type SourceChannel =
  | 'DESKTOP_WINDOW'
  | 'BROWSER_TAB'
  | 'COORDINATED_DESKTOP_WEB';

export type MachinePowerState =
  | 'ACTIVE'
  | 'SLEEPING'
  | 'POWERED_OFF'
  | 'UNKNOWN';

export type CollectorState = 'CONNECTED' | 'DISCONNECTED';

export type InputState = 'ACTIVE' | 'AFK';

// ============================================================================
// 2. Canonical Domain Models
// ============================================================================

export interface TemporalActivityBlock {
  id: string;
  userId: string;
  deviceId: string | null;
  observationSetFingerprint: string;
  startTime: string | Date;
  endTime: string | Date;
  wallClockDurationMs: number;
  observedActiveDurationMs: number;
  pausedDurationMs: number;
  track: TrackType;
  primaryApplication: string;
  cleanTitle: string;
  domain: string | null;
  sanitizedUrl: string | null;
  sourceChannel: SourceChannel;
  rawEventCount: number;
  interactionDensity: Record<string, unknown> | null;
  sourceComposition: Record<string, unknown> | null;
  semanticVersion: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface BlockObservation {
  id: string;
  blockId: string;
  activityId: string;
  contributionStart: string | Date;
  contributionEnd: string | Date;
  contributionDurationMs: number;
}

export interface SemanticClaim {
  id: string;
  blockId: string;
  claimType: ClaimType;
  value: string;
  confidence: number | null;
  provenance: ClaimProvenance;
  authority: ClaimAuthority;
  engineVersion: string;
  ruleSetVersion: string | null;
  evaluatedAt: string | Date;
  inputFingerprint: string | null;
  isCurrent: boolean;
  supersedesId: string | null;
}

export interface ClaimEvidence {
  id: string;
  claimId: string | null;
  linkId: string | null;
  inferenceId: string | null;
  evidenceType: string;
  evidenceReference: string;
  weight: number;
}

export interface ActivityContextLink {
  id: string;
  blockId: string;
  userId: string;
  targetScope: TargetScope;
  taskId: string | null;
  goalId: string | null;
  projectTag: string | null;
  relevance: ContextRelevance;
  intentionRelationship: IntentionRelationship;
  confidence: number | null;
  provenance: ClaimProvenance;
  authority: ClaimAuthority;
}

export interface AttentionInference {
  id: string;
  blockId: string;
  focusEvidenceState: FocusEvidenceState;
  confidence: number | null;
  provenance: ClaimProvenance;
  authority: ClaimAuthority;
}

export interface TelemetryCoverageGap {
  id: string;
  userId: string;
  deviceId: string | null;
  startTime: string | Date;
  endTime: string | Date;
  durationSeconds: number;
  coverageState: CoverageState;
  reconciliationState: ReconciliationState;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface UserGapExplanation {
  id: string;
  gapId: string;
  userId: string;
  startTime: string | Date;
  endTime: string | Date;
  explanationType: string;
  description: string;
  offlineWorkContext: string | null;
  associatedTaskId: string | null;
  associatedGoalId: string | null;
  createdAt: string | Date;
}

export interface UserActivityRule {
  id: string;
  userId: string;
  name: string;
  priority: number;
  isEnabled: boolean;
  applicationPattern: string | null;
  domainPattern: string | null;
  titlePattern: string | null;
  urlPattern: string | null;
  assignedModality: ActivityModality | null;
  assignedContext: string | null;
  defaultRelevance: ContextRelevance | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface UserActivityOverride {
  id: string;
  userId: string;
  targetTimeWindowStart: string | Date;
  targetTimeWindowEnd: string | Date;
  targetApplication: string;
  targetObservationSetFingerprint: string | null;
  targetClaimFamily: string;
  targetClaimType: string;
  overriddenValue: string;
  associatedTaskId: string | null;
  reason: string | null;
  createdAt: string | Date;
}

export interface ProposedDeviceHeartbeat {
  id: string;
  userId: string;
  deviceId: string;
  timestamp: string | Date;
  machinePowerState: MachinePowerState;
  collectorState: CollectorState;
  inputState: InputState;
  batteryLevel: number | null;
}
