import type { HistoricalWindow } from "./source";
import { enforceAntiLeakage } from "./source";
import { countDistinctCalendarDays } from "../qualification/temporal";
import { isValidFinite } from "../shared/math";

export interface BaselineResult {
  /**
   * Identity of the population evaluated (e.g. "completed_task_episodes").
   */
  readonly populationType: string;

  /**
   * Identity of the extracted metric (e.g. "wallClockFragmentationRatio").
   */
  readonly metricName: string;

  /**
   * The aggregation strategy used (e.g. "median").
   */
  readonly strategy: string;

  /**
   * The validated historical boundary [start, end).
   */
  readonly baselineWindow: HistoricalWindow;

  /**
   * The count of population items meeting qualification guards.
   */
  readonly qualifiedPopulationCount: number;

  /**
   * Count of unique local calendar days containing qualifying population items.
   */
  readonly distinctCalendarDayCount: number;

  /**
   * The final statistical computation.
   */
  readonly aggregatedValue: number | null;

  /**
   * Availability or comparison status.
   * Does NOT mutate or emit PatternExecutionStatus.
   */
  readonly status: "VALID" | "INSUFFICIENT_BASELINE_DATA" | "NO_AGGREGATABLE_VALUES" | "UNDEFINED_ZERO_BASELINE" | "INDETERMINATE_COVERAGE" | string;
}

export interface BaselineEvaluationConfig<T> {
  populationType: string;
  metricName: string;
  strategy: string;
  
  /**
   * The minimum number of qualifying items required to compute a baseline.
   * Note: The generic baseline engine does not define universal Phase 4 sufficiency thresholds.
   * These are detector/request-specific caller-provided requirements.
   */
  minimumPopulationCount?: number;

  /**
   * The minimum number of distinct calendar days required to compute a baseline.
   * Note: The generic baseline engine does not define universal Phase 4 sufficiency thresholds.
   * These are detector/request-specific caller-provided requirements.
   */
  minimumDistinctDays?: number;

  /**
   * Predicate to filter the population to qualifying items only.
   */
  qualifier: (item: T) => boolean;

  /**
   * Extracts the numeric metric to aggregate from a qualifying item.
   * Return null if the metric cannot be extracted (item will be skipped for aggregation).
   */
  metricExtractor: (item: T) => number | null;

  /**
   * Performs the statistical aggregation over the extracted metrics.
   */
  aggregator: (values: number[]) => number | null;

  /**
   * Optional: Extracts the ISO 8601 UTC timestamp from a qualifying item for distinct day counting.
   */
  timestampExtractor?: (item: T) => string | null;

  /**
   * Optional: The local timezone used for counting distinct calendar days. Defaults to "UTC".
   */
  timezone?: string;
}

/**
 * Consumes a historical population already bounded to the requested half-open historical window,
 * validates the window contract, applies detector-requested qualification, extracts metrics, 
 * and aggregates them into a typed BaselineResult.
 * 
 * @param population The raw population items within the historical window.
 * @param window The historical window [start, end) the population is bounded to.
 * @param evaluationStart The start of the current evaluation window (used to enforce anti-leakage).
 * @param config Evaluation configuration including qualification and aggregation delegates.
 * @returns A strictly typed BaselineResult.
 */
export function evaluateBaseline<T>(
  population: T[],
  window: HistoricalWindow,
  evaluationStart: string,
  config: BaselineEvaluationConfig<T>
): BaselineResult {
  // Validate anti-leakage contract immediately
  enforceAntiLeakage(window, evaluationStart);

  // Apply qualification guards
  const qualifiedItems = population.filter(config.qualifier);
  const qualifiedCount = qualifiedItems.length;

  // Compute distinct calendar days if requested
  let distinctDays = 0;
  if (config.timestampExtractor) {
    const timestamps = qualifiedItems
      .map(config.timestampExtractor)
      .filter((t): t is string => t !== null);
    distinctDays = countDistinctCalendarDays(timestamps, config.timezone ?? "UTC");
  }

  // Check baseline data sufficiency
  const minCount = config.minimumPopulationCount ?? 1;
  const minDays = config.minimumDistinctDays ?? 1;

  if (qualifiedCount < minCount || (config.timestampExtractor && distinctDays < minDays)) {
    return {
      populationType: config.populationType,
      metricName: config.metricName,
      strategy: config.strategy,
      baselineWindow: window,
      qualifiedPopulationCount: qualifiedCount,
      distinctCalendarDayCount: distinctDays,
      aggregatedValue: null,
      status: "INSUFFICIENT_BASELINE_DATA",
    };
  }

  // Extract metrics
  const extractedValues: number[] = [];
  for (const item of qualifiedItems) {
    const val = config.metricExtractor(item);
    if (val === null) continue; // Valid omission

    if (!isValidFinite(val)) {
      // Invalid numeric metric encountered
      return {
        populationType: config.populationType,
        metricName: config.metricName,
        strategy: config.strategy,
        baselineWindow: window,
        qualifiedPopulationCount: qualifiedCount,
        distinctCalendarDayCount: distinctDays,
        aggregatedValue: null,
        status: "NO_AGGREGATABLE_VALUES",
      };
    }
    extractedValues.push(val);
  }

  if (extractedValues.length === 0) {
    return {
      populationType: config.populationType,
      metricName: config.metricName,
      strategy: config.strategy,
      baselineWindow: window,
      qualifiedPopulationCount: qualifiedCount,
      distinctCalendarDayCount: distinctDays,
      aggregatedValue: null,
      status: "INSUFFICIENT_BASELINE_DATA",
    };
  }

  // Aggregate metrics
  const result = config.aggregator(extractedValues);
  
  if (result === null || !isValidFinite(result)) {
    return {
      populationType: config.populationType,
      metricName: config.metricName,
      strategy: config.strategy,
      baselineWindow: window,
      qualifiedPopulationCount: qualifiedCount,
      distinctCalendarDayCount: distinctDays,
      aggregatedValue: null,
      status: "NO_AGGREGATABLE_VALUES",
    };
  }

  return {
    populationType: config.populationType,
    metricName: config.metricName,
    strategy: config.strategy,
    baselineWindow: window,
    qualifiedPopulationCount: qualifiedCount,
    distinctCalendarDayCount: distinctDays,
    aggregatedValue: result,
    status: "VALID",
  };
}
