/**
 * ProductiveHix Dedicated Worker Application (`apps/worker`)
 * Postgres-direct dispatcher (no Redis, no BullMQ).
 *
 * Hosts TimelineWorker and PatternWorker, driven by Postgres rows
 * (timeline_work + outbox_events) claimed with leases and executed
 * in-process through the shared BaseWorker.run engine.
 */

export * from './base';
export * from './outbox';
export * from './shared/context';
export * from './shared/logging';
export * from './shared/retry';
export * from './shared/locking';
export * from './shared/metrics';

export const WORKER_SUBSYSTEM_METADATA = {
  name: '@repo/worker',
  version: '0.3.0-postgres-direct',
  status: 'POSTGRES_DIRECT_NO_REDIS',
  runtimeExecutionEnabled: true,
} as const;

export function printWorkerPhase0Status(): void {
  console.log(
    `[ProductiveHix Worker] Phase 0 Architecture Freeze initialized. ` +
    `Dedicated worker process scaffolded. Runtime processors scheduled for Phase 1.`
  );
}
