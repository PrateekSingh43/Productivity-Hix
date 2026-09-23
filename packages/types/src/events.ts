/**
 * Canonical Domain Event Envelope & Outbox Contracts
 * Defines the standard transport contract for asynchronous background events.
 */

export interface DomainEventEnvelope<T = unknown> {
  id: string; // Unique event UUID/cuid
  eventType: string; // e.g. "telemetry.ingested", "rule.changed", "timeline.window.materialized"
  aggregateType: string; // e.g. "user", "telemetry", "timeline", "rule"
  aggregateId: string; // e.g. userId or entity id
  payload: T;
  correlationId: string;
  causationId?: string;
  version: string; // schema version e.g. "1.0.0"
  occurredAt: string; // ISO timestamp
}

export type OutboxEventStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'DEAD_LETTER';

export interface OutboxRecord<T = unknown> {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: T;
  status: OutboxEventStatus;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  scheduledFor: Date;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
