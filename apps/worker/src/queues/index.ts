/**
 * Phase 0 Worker Queues Definition
 * Re-exports canonical queue names and helper utilities.
 */

import { PRODUCTIVEHIX_QUEUES, type ProductiveHixQueueName } from '@repo/types';

export { PRODUCTIVEHIX_QUEUES, type ProductiveHixQueueName };

export interface QueueDescriptor {
  name: ProductiveHixQueueName;
  description: string;
  concurrencyLimit: number;
  defaultPriority: number;
}

export const QUEUE_DESCRIPTORS: Record<ProductiveHixQueueName, QueueDescriptor> = {
  [PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION]: {
    name: PRODUCTIVEHIX_QUEUES.TIMELINE_MATERIALIZATION,
    description: 'Asynchronous day-level temporal reconstruction and semantic block materialization',
    concurrencyLimit: 4,
    defaultPriority: 10,
  },
  [PRODUCTIVEHIX_QUEUES.PATTERN_ANALYSIS]: {
    name: PRODUCTIVEHIX_QUEUES.PATTERN_ANALYSIS,
    description: 'Multi-day statistical pattern recurrence and baseline comparison engine',
    concurrencyLimit: 2,
    defaultPriority: 5,
  },
  [PRODUCTIVEHIX_QUEUES.INSIGHT_GENERATION]: {
    name: PRODUCTIVEHIX_QUEUES.INSIGHT_GENERATION,
    description: 'Token-efficient AI daily synthesis and behavioral deduction generator',
    concurrencyLimit: 2,
    defaultPriority: 1,
  },
};
