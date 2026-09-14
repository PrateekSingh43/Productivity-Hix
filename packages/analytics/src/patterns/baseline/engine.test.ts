import { describe, it } from "node:test";
import assert from "node:assert";
import { evaluateBaseline, type BaselineEvaluationConfig } from "./engine";
import type { HistoricalWindow } from "./source";
import { median } from "./statistics";

describe("Baseline: Engine", () => {
  interface DummySession {
    id: string;
    timestamp: string;
    switches: number;
    valid: boolean;
  }

  const dummyPopulation: DummySession[] = [
    { id: "1", timestamp: "2023-01-01T10:00:00Z", switches: 5, valid: true },
    { id: "2", timestamp: "2023-01-01T14:00:00Z", switches: 15, valid: true },
    { id: "3", timestamp: "2023-01-02T10:00:00Z", switches: 10, valid: true },
    { id: "4", timestamp: "2023-01-02T12:00:00Z", switches: 0, valid: true }, // Zero is valid
    { id: "5", timestamp: "2023-01-02T14:00:00Z", switches: -1, valid: false }, // Should be filtered out
  ];

  const defaultConfig: BaselineEvaluationConfig<DummySession> = {
    populationType: "dummy_sessions",
    metricName: "switches",
    strategy: "median",
    qualifier: (s) => s.valid,
    metricExtractor: (s) => (s.switches >= 0 ? s.switches : null),
    aggregator: median,
    timestampExtractor: (s) => s.timestamp,
    timezone: "UTC",
  };

  const window: HistoricalWindow = {
    start: "2023-01-01T00:00:00Z",
    end: "2023-01-15T00:00:00Z",
  };
  const evalStart = "2023-01-15T00:00:00Z";

  it("should successfully evaluate a valid baseline", () => {
    const result = evaluateBaseline(dummyPopulation, window, evalStart, defaultConfig);
    
    assert.strictEqual(result.status, "VALID");
    assert.strictEqual(result.populationType, "dummy_sessions");
    assert.strictEqual(result.metricName, "switches");
    assert.strictEqual(result.strategy, "median");
    
    assert.strictEqual(result.qualifiedPopulationCount, 4); // item 5 filtered out
    assert.strictEqual(result.distinctCalendarDayCount, 2); // Jan 1, Jan 2
    
    // Median of [0, 5, 10, 15] is 7.5
    assert.strictEqual(result.aggregatedValue, 7.5);
  });

  it("should enforce anti-leakage strictly", () => {
    assert.throws(
      () => evaluateBaseline(dummyPopulation, window, "2023-01-14T00:00:00Z", defaultConfig),
      /Baseline leakage detected/
    );
  });

  it("should return INSUFFICIENT_BASELINE_DATA if population count is below minimum", () => {
    const config = { ...defaultConfig, minimumPopulationCount: 5 };
    const result = evaluateBaseline(dummyPopulation, window, evalStart, config);
    
    assert.strictEqual(result.status, "INSUFFICIENT_BASELINE_DATA");
    assert.strictEqual(result.aggregatedValue, null);
  });

  it("should return INSUFFICIENT_BASELINE_DATA if distinct days are below minimum", () => {
    const config = { ...defaultConfig, minimumDistinctDays: 3 };
    const result = evaluateBaseline(dummyPopulation, window, evalStart, config);
    
    assert.strictEqual(result.status, "INSUFFICIENT_BASELINE_DATA");
    assert.strictEqual(result.aggregatedValue, null);
  });

  it("should return NO_AGGREGATABLE_VALUES if aggregation fails or returns null", () => {
    const config = { ...defaultConfig, aggregator: () => null };
    const result = evaluateBaseline(dummyPopulation, window, evalStart, config);
    
    assert.strictEqual(result.status, "NO_AGGREGATABLE_VALUES");
    assert.strictEqual(result.aggregatedValue, null);
  });

  it("should return NO_AGGREGATABLE_VALUES immediately if any extracted metric is non-finite", () => {
    const invalidPopulation = [
      { id: "1", timestamp: "2023-01-01T10:00:00Z", switches: 5, valid: true },
      { id: "2", timestamp: "2023-01-01T14:00:00Z", switches: NaN, valid: true }, // Invalid!
    ];
    const config = { 
      ...defaultConfig, 
      metricExtractor: (s: typeof invalidPopulation[0]) => s.switches // Pass NaN through
    };
    
    const result = evaluateBaseline(invalidPopulation, window, evalStart, config);
    
    assert.strictEqual(result.status, "NO_AGGREGATABLE_VALUES");
    assert.strictEqual(result.aggregatedValue, null);
  });
});
