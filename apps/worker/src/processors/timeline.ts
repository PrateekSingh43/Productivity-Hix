/**
 * Timeline Materialization Processor
 * 
 * Delegates execution to the authoritative TimelineWorker.
 */

import type { TimelineMaterializationJobData, WorkerJobResult } from '@repo/types';
import type { WorkerJobContext } from '../shared/context';
import { TimelineWorker } from '../timeline/timeline-worker';
import { getDb } from '@repo/db';

export interface TimelineProcessorOptions {
  enableShadowVerification?: boolean;
}

export async function processTimelineMaterializationJob(
  jobData: TimelineMaterializationJobData,
  context: WorkerJobContext,
  _options: TimelineProcessorOptions = {}
): Promise<WorkerJobResult> {
  const worker = new TimelineWorker(getDb());
  const res = await worker.run(jobData, {
    jobId: context.jobId,
    correlationId: context.correlationId,
    attempt: context.attempt,
  });
  return res as unknown as WorkerJobResult;
}
