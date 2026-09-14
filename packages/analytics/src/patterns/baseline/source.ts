export interface HistoricalWindow {
  /**
   * Start of the historical window, inclusive. (ISO 8601 UTC string)
   */
  start: string;
  
  /**
   * End of the historical window, exclusive. (ISO 8601 UTC string)
   */
  end: string;
}

/**
 * Ensures the historical window ends strictly before or exactly at the evaluation start,
 * preventing statistical leakage of contemporaneous data into the baseline.
 * 
 * @param window The historical window [start, end)
 * @param evaluationStart The start of the current evaluation window
 * @throws Error if the historical window leaks into or beyond the evaluation start
 */
export function enforceAntiLeakage(window: HistoricalWindow, evaluationStart: string): void {
  const windowEndMs = Date.parse(window.end);
  const evalStartMs = Date.parse(evaluationStart);

  if (Number.isNaN(windowEndMs)) {
    throw new Error("Invalid baseline window end timestamp");
  }
  if (Number.isNaN(evalStartMs)) {
    throw new Error("Invalid evaluation start timestamp");
  }
  
  if (windowEndMs > evalStartMs) {
    throw new Error(
      `Baseline leakage detected: Historical window end (${window.end}) ` +
      `is after evaluation start (${evaluationStart}).`
    );
  }
}

/**
 * A source-neutral adapter interface.
 * The implementation must return a population that is already bounded 
 * to the requested half-open historical window.
 */
export interface BaselinePopulationProvider<T> {
  /**
   * The semantic identity of the population provided (e.g., "qualifying_sessions", "completed_task_episodes").
   */
  readonly populationType: string;

  /**
   * Fetches the bounded historical population.
   * 
   * @param userId The ID of the user.
   * @param window The historical window [start, end) the population is bounded to.
   * @returns A promise resolving to the historical population array.
   */
  fetchPopulation(userId: string, window: HistoricalWindow): Promise<T[]>;
}
