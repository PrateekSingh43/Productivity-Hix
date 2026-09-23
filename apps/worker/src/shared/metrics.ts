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

export type InfrastructureMetricEvent =
  | 'job.started'
  | 'job.succeeded'
  | 'job.failed'
  | 'job.retryable_failure'
  | 'job.timeout'
  | 'job.superseded'
  | 'job.duration';

export interface WorkerMetricsCollector {
  increment(metric: InfrastructureMetricEvent, tags?: Record<string, string | number>): void;
  timing(metric: 'job.duration', durationMs: number, tags?: Record<string, string | number>): void;
}

export class MemoryWorkerMetricsCollector implements WorkerMetricsCollector {
  public readonly counts = new Map<string, number>();
  public readonly timings: { metric: string; durationMs: number; tags?: Record<string, string | number> }[] = [];

  increment(metric: InfrastructureMetricEvent, tags?: Record<string, string | number>): void {
    const key = tags?.queue ? `${metric}:${tags.queue}` : metric;
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  timing(metric: 'job.duration', durationMs: number, tags?: Record<string, string | number>): void {
    this.timings.push({ metric, durationMs, tags });
  }

  getCount(metric: InfrastructureMetricEvent, queue?: string): number {
    const key = queue ? `${metric}:${queue}` : metric;
    return this.counts.get(key) ?? 0;
  }

  clear(): void {
    this.counts.clear();
    this.timings.length = 0;
  }
}

export const noopMetricsCollector: WorkerMetricsCollector = {
  increment: () => {},
  timing: () => {},
};

