/**
 * Supersession Checker Contract
 * 
 * Allows domain implementations to verify whether current job inputs are stale
 * compared to authoritative database state.
 */

import type { WorkerExecutionContext } from './context';

export interface SupersessionChecker<TData> {
  isSuperseded(data: TData, context: WorkerExecutionContext): Promise<boolean>;
}

/**
 * Default no-op supersession checker for jobs that do not support supersession.
 */
export class NeverSupersededChecker<TData> implements SupersessionChecker<TData> {
  async isSuperseded(): Promise<boolean> {
    return false;
  }
}
