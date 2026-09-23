/**
 * TestWorker — Test-Controlled Domain Worker
 * 
 * Implements BaseWorker with explicitly controllable outcomes for unit & integration testing:
 * - SUCCESS
 * - RETRY_ONCE
 * - PERMANENT_FAILURE
 * - TIMEOUT
 * - PRE_SUPERSEDED
 * - POST_SUPERSEDED
 * - IDEMPOTENT_EXISTING
 */

import { BaseWorker } from '../base/worker';
import {
  WorkerValidationError,
  WorkerRetryableError,
  WorkerPermanentError,
} from '../base/errors';
import type { WorkerExecutionContext } from '../base/context';
import { formatJobIdentity } from '../base/identity';

export type TestWorkerOutcome =
  | 'SUCCESS'
  | 'RETRY_ONCE'
  | 'PERMANENT_FAILURE'
  | 'TIMEOUT'
  | 'PRE_SUPERSEDED'
  | 'POST_SUPERSEDED'
  | 'IDEMPOTENT_EXISTING';

export interface TestWorkerJobData {
  testId: string;
  expectedOutcome: TestWorkerOutcome;
  delayMs?: number;
  payloadValue?: string;
  currentSourceVersion?: number;
}

export interface TestWorkerResult {
  testId: string;
  processedAt: string;
  attempts: number;
  value: string;
}

export class TestWorker extends BaseWorker<TestWorkerJobData, TestWorkerResult> {
  readonly workerName = 'TestWorker';
  readonly queueName = 'test-queue';

  // In-memory durable store simulation for idempotency & supersession testing
  public readonly durableStore = new Map<string, TestWorkerResult>();
  public currentAuthoritativeVersion = 1;
  public executionCount = 0;
  public supersededCount = 0;

  validate(raw: unknown): TestWorkerJobData {
    if (!raw || typeof raw !== 'object') {
      throw new WorkerValidationError('Payload must be a non-null object');
    }
    const data = raw as Partial<TestWorkerJobData>;
    if (!data.testId || typeof data.testId !== 'string') {
      throw new WorkerValidationError('Field testId is required and must be a string');
    }
    if (!data.expectedOutcome || typeof data.expectedOutcome !== 'string') {
      throw new WorkerValidationError('Field expectedOutcome is required and must be a string');
    }
    return {
      testId: data.testId,
      expectedOutcome: data.expectedOutcome as TestWorkerOutcome,
      delayMs: data.delayMs,
      payloadValue: data.payloadValue,
      currentSourceVersion: data.currentSourceVersion ?? 1,
    };
  }

  getJobIdentity(data: TestWorkerJobData): string {
    return formatJobIdentity('test-job', [data.testId]);
  }

  async checkIdempotency(data: TestWorkerJobData): Promise<TestWorkerResult | null> {
    if (data.expectedOutcome === 'IDEMPOTENT_EXISTING') {
      return (
        this.durableStore.get(data.testId) ?? {
          testId: data.testId,
          processedAt: '2026-09-23T00:00:00.000Z',
          attempts: 1,
          value: 'pre-existing-idempotent-value',
        }
      );
    }
    return this.durableStore.get(data.testId) ?? null;
  }

  async checkSuperseded(
    data: TestWorkerJobData,
    _context: WorkerExecutionContext
  ): Promise<boolean> {
    if (data.expectedOutcome === 'PRE_SUPERSEDED') {
      return true;
    }
    if (data.expectedOutcome === 'POST_SUPERSEDED') {
      // Simulate source version mutation during execution: false before execute, true after execute
      return this.executionCount > 0;
    }
    // Dynamic source version check: if external source version moved ahead
    if (data.currentSourceVersion && data.currentSourceVersion < this.currentAuthoritativeVersion) {
      return true;
    }
    return false;
  }

  override async onSuperseded(
    _data: TestWorkerJobData,
    _context: WorkerExecutionContext
  ): Promise<void> {
    this.supersededCount++;
  }

  async execute(
    data: TestWorkerJobData,
    context: WorkerExecutionContext
  ): Promise<TestWorkerResult> {
    this.executionCount++;

    // 1. TIMEOUT Simulation (respects cooperative cancellation)
    if (data.expectedOutcome === 'TIMEOUT') {
      const waitMs = data.delayMs ?? 5000;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, waitMs);
        context.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(context.signal.reason);
        });
      });
    }

    // 2. RETRY_ONCE Simulation
    if (data.expectedOutcome === 'RETRY_ONCE') {
      if (context.attempt === 1) {
        throw new WorkerRetryableError(`Transient network failure on attempt 1 for testId: ${data.testId}`);
      }
    }

    // 3. PERMANENT_FAILURE Simulation
    if (data.expectedOutcome === 'PERMANENT_FAILURE') {
      throw new WorkerPermanentError(`Unrecoverable data invariant failure for testId: ${data.testId}`);
    }

    // Optional simulated work delay
    if (data.delayMs && data.expectedOutcome !== 'TIMEOUT') {
      await new Promise((r) => setTimeout(r, data.delayMs));
    }

    const result: TestWorkerResult = {
      testId: data.testId,
      processedAt: new Date().toISOString(),
      attempts: context.attempt,
      value: data.payloadValue ?? 'success-result',
    };

    // Store in durable storage
    this.durableStore.set(data.testId, result);

    return result;
  }

  reset(): void {
    this.durableStore.clear();
    this.currentAuthoritativeVersion = 1;
    this.executionCount = 0;
    this.supersededCount = 0;
  }
}
