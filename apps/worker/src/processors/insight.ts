/**
 * Phase 0 Insight Generation Processor Contract (STUB)
 * 
 * Scheduled implementation: PHASE 5.
 */

import type { InsightGenerationJobData, WorkerJobResult } from '@repo/types';
import type { WorkerJobContext } from '../shared/context';

export async function processInsightGenerationJob(
  jobData: InsightGenerationJobData,
  context: WorkerJobContext
): Promise<WorkerJobResult> {
  throw new Error(
    `[PHASE_0_SAFETY_GUARD] Insight generation processor is a contract scaffold. ` +
    `Runtime implementation is scheduled for Phase 5. JobId: ${context.jobId}, User: ${jobData.userId}`
  );
}
