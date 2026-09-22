/**
 * Phase 0 Frozen Observation & Presence Integrity Contracts
 * Canonical Domain Types for Machine State, User Presence, and Telemetry Boundaries.
 * 
 * Inviolable Principles:
 * 1. Machine state != User presence.
 * 2. Lack of input != Automatically user absence.
 * 3. Machine unavailable != User inactivity.
 * 4. Missing telemetry != Unknown activity.
 * 5. Presence must use multi-signal evidence, never a naive "no input for X minutes => absent" check.
 */

// ============================================================================
// 1. Machine Availability Dimension
// ============================================================================

export type MachineAvailabilityState = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';

export type MachineUnavailableSubtype =
  | 'SLEEP'
  | 'HIBERNATION'
  | 'POWER_OFF'
  | 'LOCKED'
  | 'OTHER';

export interface MachineStateDetail {
  state: MachineAvailabilityState;
  subtype?: MachineUnavailableSubtype;
  confidence: number; // 0.0 - 1.0
  source: 'WINDOWS_OS_HOOK' | 'HEARTBEAT_TIMEOUT' | 'INFERRED' | 'USER_REPORT';
}

export interface MachineStateEvent {
  id: string;
  userId: string;
  deviceId: string;
  timestamp: string | Date;
  state: MachineAvailabilityState;
  subtype?: MachineUnavailableSubtype;
  batteryLevel?: number | null;
  provenance: string;
}

export interface AvailabilityBoundary {
  id: string;
  userId: string;
  deviceId: string;
  startTime: string | Date;
  endTime: string | Date;
  durationMs: number;
  state: MachineAvailabilityState;
  subtype?: MachineUnavailableSubtype;
  evidenceReference: string;
}

// ============================================================================
// 2. Presence & Observation State Dimension
// ============================================================================

/**
 * Presence State reflects evidence of user presence regardless of physical keystrokes.
 * - ACTIVITY: Meaningful interaction/input observed.
 * - QUIET_ACTIVITY: Low/no physical input, but strong evidence of ongoing cognitive presence
 *   (e.g., reading docs, reviewing PR, watching technical tutorial, thinking/paper design).
 * - PROLONGED_ABSENCE: Machine was available, but multi-signal evidence indicates user was away.
 * - UNKNOWN: Insufficient evidence to determine presence.
 */
export type PresenceState =
  | 'ACTIVITY'
  | 'QUIET_ACTIVITY'
  | 'PROLONGED_ABSENCE'
  | 'UNKNOWN';

export interface PresenceEvidence {
  presenceState: PresenceState;
  inputCadencePerMinute: number;
  audibleMediaActive: boolean;
  activeWindowContinuousMs: number;
  viewportInteractionsCount: number;
  confidence: number;
}

// ============================================================================
// 3. Telemetry Coverage Dimension
// ============================================================================

/**
 * Coverage describes whether observation data stream exists.
 * A coverage GAP is an analytical interval requiring resolution, NOT an activity modality.
 */
export type CoverageIntegrityState = 'CONTINUOUS' | 'GAP';

export interface CoverageGapInterval {
  id: string;
  userId: string;
  deviceId?: string | null;
  startTime: string | Date;
  endTime: string | Date;
  durationSeconds: number;
  machineState: MachineAvailabilityState;
  reconciliationState: 'UNEXPLAINED' | 'PENDING_PROMPT' | 'EXPLAINED' | 'DISMISSED';
}

// ============================================================================
// 4. Browser Observation & Continuity Contract
// ============================================================================

export interface BrowserObservationPayload {
  installationId: string;
  tabId?: number;
  url: string;
  domain: string;
  pageTitle: string;
  startTime: string | Date;
  endTime: string | Date;
  durationMs: number;
  audible?: boolean;
  incognito?: boolean;
  windowFocused: boolean;
  interactionCount: number;
  heartbeatSeq?: number;
}
