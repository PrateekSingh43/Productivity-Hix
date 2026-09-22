/**
 * Phase 0 Worker Shared Infrastructure: Metrics & Telemetry Concepts
 * Tracks job latency, queue wait time, and stage breakdowns.
 */

export interface WorkerStageTimer {
  queueWaitMs?: number;
  observationLoadMs?: number;
  temporalEngineMs?: number;
  semanticClassificationMs?: number;
  alignmentMs?: number;
  attentionMs?: number;
  persistenceMs?: number;
  validationMs?: number;
  activationMs?: number;
  totalDurationMs?: number;
}

export class StageTimer {
  private starts = new Map<string, number>();
  private durations: Record<string, number> = {};
  private overallStart = Date.now();

  start(stage: string): void {
    this.starts.set(stage, Date.now());
  }

  end(stage: string): number {
    const s = this.starts.get(stage);
    if (!s) return 0;
    const dur = Date.now() - s;
    this.durations[stage] = (this.durations[stage] ?? 0) + dur;
    this.starts.delete(stage);
    return dur;
  }

  finish(): WorkerStageTimer & { totalDurationMs: number } {
    return {
      ...this.durations,
      totalDurationMs: Date.now() - this.overallStart,
    };
  }
}
