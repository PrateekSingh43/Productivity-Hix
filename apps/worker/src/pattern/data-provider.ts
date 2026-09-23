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
  /** Max source-data timestamp observed (ISO). Any change => inputs changed. */
  maxSourceAt: string;
}

export interface PatternDataProvider {
  loadInput(data: PatternAnalysisJobData): Promise<PatternPipelineInput>;
  readWatermarks(data: PatternAnalysisJobData): Promise<SourceWatermarks>;
}
