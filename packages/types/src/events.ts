/**
 * Canonical Domain Event Envelope & Outbox Contracts
 * Defines the standard transport contract for asynchronous background events.
 */

export interface DomainEventEnvelope<T = unknown> {
  id: string; // Unique event UUID/cuid
  eventType: string; // e.g. "telemetry.ingested", "rule.changed", "timeline.materialized"
  aggregateType: string; // e.g. "user", "telemetry", "rule"
  aggregateId: string; // e.g. userId or entity id
  payload: T;
  correlationId: string;
  causationId?: string | null;
  schemaVersion: string; // e.g. "1.0.0"
  occurredAt: string; // ISO timestamp string
}

export type OutboxEventStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PUBLISHED'
  | 'DEAD_LETTER';

export interface OutboxRecord<T = unknown> {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: T;
  correlationId: string;
  causationId: string | null;
  schemaVersion: string;
  occurredAt: Date;
  status: OutboxEventStatus;
  publicationAttemptCount: number;
  maxAttempts: number;
  availableAt: Date;
  claimedBy: string | null;
  claimExpiresAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Minimal Timeline event trigger payload referencing authoritative state in PostgreSQL.
 * Does NOT duplicate raw telemetry or ActivityWatch events.
 */
export interface TimelineTriggerPayload {
  userId: string;
  localDate: string; // "YYYY-MM-DD"
  sourceRevision: number;
  scope: {
    start: string; // ISO string
    end: string; // ISO string
  };
  reason: 'telemetry_ingested' | 'rule_changed' | 'manual_reprocess';
  ruleRevision: number;
}
