/**
 * Base Worker Typed Result
 * 
 * Invariant:
 * Failures MUST throw exceptions so BullMQ can manage retry attempts and backoff.
 * Successful completions return SUCCEEDED or SUPERSEDED.
 */

export type WorkerResult<TResult> =
  | {
      status: 'SUCCEEDED';
      value: TResult;
    }
  | {
      status: 'SUPERSEDED';
    };
