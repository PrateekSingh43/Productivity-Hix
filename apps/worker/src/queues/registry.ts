/**
 * Canonical Queue Registry & Event Routing Architecture
 * 
 * Provides single authoritative mapping:
 * Event Type -> Target Queue -> Worker Processor
 */

import { PRODUCTIVEHIX_QUEUES, type ProductiveHixQueueName } from '@repo/types';

export interface QueueDescriptor {
  name: ProductiveHixQueueName;
  description: string;
  concurrencyLimit: number;
  defaultPriority: number;
  processorName: string;
}

export const CANONICAL_QUEUE_REGISTRY: Record<ProductiveHixQueueName, QueueDescriptor> = {
  [PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION]: {
    name: PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION,
    description: 'Day-level temporal reconstruction and semantic block materialization',
    concurrencyLimit: 4,
    defaultPriority: 10,
    processorName: 'TimelineWorker',
  },
  [PRODUCTIVEHIX_QUEUES.ANALYTICAL_PROJECTION]: {
    name: PRODUCTIVEHIX_QUEUES.ANALYTICAL_PROJECTION,
    description: 'DuckDB relation projection from committed PostgreSQL state',
    concurrencyLimit: 2,
    defaultPriority: 8,
    processorName: 'AnalyticalProjectionWorker',
  },
  [PRODUCTIVEHIX_QUEUES.PATTERN_ANALYSIS]: {
    name: PRODUCTIVEHIX_QUEUES.PATTERN_ANALYSIS,
    description: 'Multi-day statistical recurrence detector and baseline comparison',
    concurrencyLimit: 2,
    defaultPriority: 5,
    processorName: 'PatternWorker',
  },
  [PRODUCTIVEHIX_QUEUES.INSIGHT_GENERATION]: {
    name: PRODUCTIVEHIX_QUEUES.INSIGHT_GENERATION,
    description: 'Deterministic evidence preparation and controlled AI synthesis',
    concurrencyLimit: 2,
    defaultPriority: 1,
    processorName: 'InsightWorker',
  },
};

/**
 * Event-to-Queue routing table.
 * Directs durable outbox domain events to the responsible BullMQ queue.
 */
export const EVENT_TO_QUEUE_MAPPING: Record<string, ProductiveHixQueueName> = {
  'telemetry.ingested': PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION,
  'rule.changed': PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION,
  'override.changed': PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION,
  'gap.explained': PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION,
  'timeline.window.materialized': PRODUCTIVEHIX_QUEUES.ANALYTICAL_PROJECTION,
  'projection.window.updated': PRODUCTIVEHIX_QUEUES.PATTERN_ANALYSIS,
  'pattern.analysis.requested': PRODUCTIVEHIX_QUEUES.PATTERN_ANALYSIS,
  'pattern.qualified': PRODUCTIVEHIX_QUEUES.INSIGHT_GENERATION,
  'pattern.changed': PRODUCTIVEHIX_QUEUES.INSIGHT_GENERATION,
};

export function resolveQueueForEvent(eventType: string): ProductiveHixQueueName | undefined {
  return EVENT_TO_QUEUE_MAPPING[eventType];
}

export function getQueueDescriptor(queueName: string): QueueDescriptor | undefined {
  return (CANONICAL_QUEUE_REGISTRY as Record<string, QueueDescriptor | undefined>)[queueName];
}

export function getAllQueueDescriptors(): QueueDescriptor[] {
  return Object.values(CANONICAL_QUEUE_REGISTRY);
}
