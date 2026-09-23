/**
 * Base Worker Error Taxonomy
 * Defines explicit error types with retryability semantics.
 */

export type WorkerErrorCode =
  | 'VALIDATION_ERROR'
  | 'RETRYABLE_ERROR'
  | 'PERMANENT_ERROR'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'SUPERSEDED';

export class WorkerError extends Error {
  constructor(
    message: string,
    public readonly code: WorkerErrorCode,
    public readonly isRetryable: boolean = false,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'WorkerError';
  }
}

export class WorkerValidationError extends WorkerError {
  constructor(message: string, cause?: unknown) {
    super(message, 'VALIDATION_ERROR', false, cause);
    this.name = 'WorkerValidationError';
  }
}

export class WorkerRetryableError extends WorkerError {
  constructor(message: string, cause?: unknown) {
    super(message, 'RETRYABLE_ERROR', true, cause);
    this.name = 'WorkerRetryableError';
  }
}

export class WorkerPermanentError extends WorkerError {
  constructor(message: string, cause?: unknown) {
    super(message, 'PERMANENT_ERROR', false, cause);
    this.name = 'WorkerPermanentError';
  }
}

export class WorkerTimeoutError extends WorkerError {
  constructor(message: string, cause?: unknown) {
    super(message, 'TIMEOUT', true, cause);
    this.name = 'WorkerTimeoutError';
  }
}

export class WorkerCancelledError extends WorkerError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CANCELLED', false, cause);
    this.name = 'WorkerCancelledError';
  }
}

export class WorkerSupersededError extends WorkerError {
  constructor(message: string, cause?: unknown) {
    super(message, 'SUPERSEDED', false, cause);
    this.name = 'WorkerSupersededError';
  }
}
