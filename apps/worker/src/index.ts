/**
 * ProductiveHix Dedicated Worker Application (`apps/worker`)
 * Phase 0 Contract & Architectural Skeleton
 * 
 * IMPORTANT:
 * This application is prepared for Phase 1 (Timeline Materialization), Phase 4 (Pattern Analysis),
 * and Phase 5 (Insight Generation). It serves as the single unified worker process hosting
 * domain-specific BullMQ processors.
 * 
 * In Phase 0, this file exports contract interfaces and verifies architectural wiring.
 */

export * from './queues';
export * from './processors';
export * from './shared/context';
export * from './shared/logging';
export * from './shared/retry';
export * from './shared/locking';
export * from './shared/metrics';

export const WORKER_SUBSYSTEM_METADATA = {
  name: '@repo/worker',
  version: '0.0.0-phase0.preparation',
  status: 'PHASE_0_SKELETON_PREPARED',
  runtimeExecutionEnabled: false,
} as const;

export function printWorkerPhase0Status(): void {
  console.log(
    `[ProductiveHix Worker] Phase 0 Architecture Freeze initialized. ` +
    `Dedicated worker process scaffolded. Runtime processors scheduled for Phase 1.`
  );
}
