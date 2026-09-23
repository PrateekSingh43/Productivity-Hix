/**
 * Pattern data provider abstraction.
 *
 * The PatternWorker reads authoritative analytical inputs through this
 * interface. The default implementation loads from PostgreSQL + the shared
 * analytics pipeline inputs. A future DailyFeatureSnapshot / analytical
 * projection can replace the implementation without touching the worker.
 */
import type { PatternAnalysisJobData } from "@repo/types";
import type { PatternPipelineInput } from "@repo/analytics";

export interface SourceWatermarks {
  /**
   * Max source-data timestamp observed (ISO).
   * Counts/sums are included because a source record can change in place
   * (e.g. telemetry duration growth) without changing its creation timestamp.
   * Any change => inputs changed.
   */
  maxSourceAt: string;
  activityCount: number;
  activityDurationSum: number;
  sessionCount: number;
  checkInCount: number;
  taskCount: number;
}

export interface PatternDataProvider {
  loadInput(data: PatternAnalysisJobData): Promise<PatternPipelineInput>;
  readWatermarks(data: PatternAnalysisJobData): Promise<SourceWatermarks>;
}
