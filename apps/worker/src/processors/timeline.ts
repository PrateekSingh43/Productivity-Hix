/**
 * Phase 0 Timeline Materialization Processor Contract (STUB)
 * 
 * IMPORTANT:
 * This file is an architectural contract and preparation skeleton for Phase 1.
 * Actual runtime materialization logic MUST NOT be implemented in Phase 0.
 * 
 * Scheduled implementation: PHASE 1.
 */

import type { TimelineMaterializationJobData, WorkerJobResult } from '@repo/types';
import type { WorkerJobContext } from '../shared/context';

export interface TimelineProcessorOptions {
  enableShadowVerification?: boolean;
}

/**
 * Phase 1 Target Processor Contract
 */
export async function processTimelineMaterializationJob(
  jobData: TimelineMaterializationJobData,
  context: WorkerJobContext,
  _options: TimelineProcessorOptions = {}
): Promise<WorkerJobResult> {
  // Phase 0 Safeguard: explicitly prevent runtime execution before Phase 1
  throw new Error(
    `[PHASE_0_SAFETY_GUARD] Timeline materialization processor is a contract scaffold. ` +
    `Runtime implementation is scheduled for Phase 1. JobId: ${context.jobId}, User: ${jobData.userId}, Date: ${jobData.localDate}`
  );
}
