/**
 * Phase 0 Worker Shared Infrastructure: Concurrency & Lock Concepts
 * 
 * Invariant:
 * Materialization for the same user + localDate MUST be serialized.
 * Multiple users/dates can process concurrently.
 */

export interface DistributedJobLock {
  resourceKey: string;
  token: string;
  expiresAt: number;
}

/**
 * Generates the canonical concurrency lock key for a timeline materialization day.
 * Pattern: `lock:timeline:${userId}:${localDate}`
 */
export function getTimelineDayLockKey(userId: string, localDate: string): string {
  return `lock:timeline:${userId}:${localDate}`;
}

export function getPatternAnalysisLockKey(userId: string): string {
  return `lock:pattern:${userId}`;
}

export function getInsightGenerationLockKey(userId: string, localDate: string): string {
  return `lock:insight:${userId}:${localDate}`;
}
