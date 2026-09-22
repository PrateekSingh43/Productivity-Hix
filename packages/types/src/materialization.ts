/**
 * Phase 0 Frozen Timeline Materialization & Snapshot Lifecycle Contracts
 * Canonical Domain Types for Asynchronous Timeline Materialization, Snapshot Generations, and Read API.
 * 
 * Inviolable Principles:
 * 1. Timeline GET is strictly a READ-ONLY path (no synchronous materialization or block persistence).
 * 2. Historical data must never disappear merely because a newer materialization is being built.
 * 3. A failed materialization must never destroy the last complete snapshot.
 * 4. A day may be STALE even when a complete previous snapshot exists (existence != freshness).
 * 5. Snapshot activation is atomic; incomplete snapshots are never exposed to readers.
 */

import type { TimelineBlock } from './timeline';
import type { TimelineSummary } from './timeline';
import type { TelemetryCoverageGap } from './semantic-timeline';

// ============================================================================
// 1. Materialization Lifecycle States
// ============================================================================

export type MaterializationStatus =
  | 'NO_DATA'        // No complete snapshot exists and no usable source data exists
  | 'STALE'          // Complete snapshot exists, but newer telemetry/rule revisions arrived
  | 'MATERIALIZING'  // Worker is actively reconstructing a new snapshot generation
  | 'READY'          // Active snapshot matches current required revisions
  | 'FAILED';        // Latest materialization attempt failed; last complete snapshot remains readable

// ============================================================================
// 2. Day Revision & Lifecycle State Contract
// ============================================================================

export interface TimelineDayState {
  id: string;
  userId: string;
  localDate: string; // ISO date format "YYYY-MM-DD"
  
  // Revision Tracking
  currentObservationRevision: number;
  materializedObservationRevision: number;
  currentRuleRevision: number;
  materializedRuleRevision: number;
  semanticVersion: string;
  
  // Snapshot Pointer
  activeSnapshotId: string | null;
  status: MaterializationStatus;
  
  // Diagnostics & Timestamps
  lastMaterializedAt: string | Date | null;
  lastAttemptedAt: string | Date | null;
  lastError: string | null;
  retryCount: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

// ============================================================================
// 3. Timeline Snapshot Contract
// ============================================================================

export interface TimelineSnapshot {
  id: string;
  userId: string;
  localDate: string; // "YYYY-MM-DD"
  snapshotGeneration: number; // Monotonically increasing revision integer
  status: 'IN_PROGRESS' | 'COMPLETE' | 'FAILED' | 'SUPERSEDED';
  
  // Revision Stamps Embedded in Snapshot
  observationRevision: number;
  ruleRevision: number;
  semanticEngineVersion: string;
  
  // Coherent Analytical Payload
  summary: TimelineSummary;
  blockCount: number;
  gapCount: number;
  
  // Wall-Clock Span & Durations
  startOfDay: string | Date;
  endOfDay: string | Date;
  wallClockDurationMs: number;
  observedActiveDurationMs: number;
  quietActivityDurationMs: number;
  prolongedAbsenceDurationMs: number;
  machineUnavailableDurationMs: number;
  coverageGapDurationMs: number;
  
  materializedAt: string | Date;
  expiresAt?: string | Date | null;
}

// ============================================================================
// 4. Read-Only Timeline Day Response Contract
// ============================================================================

export interface TimelineDayReadResponse {
  date: string;
  timezone: string;
  status: MaterializationStatus;
  isStale: boolean;
  activeSnapshotId: string | null;
  revision: {
    observationRevision: number;
    ruleRevision: number;
    semanticVersion: string;
  };
  totalDurationMs: number;
  summary: TimelineSummary;
  blocks: TimelineBlock[];
  coverageGaps: TelemetryCoverageGap[];
  renderedAt: string;
}
