export * from "./base/context";
export * from "./base/detector";
export * from "./qualification/evidence";
export * from "./qualification/guards";
export * from "./qualification/temporal";
export * from "./shared/arrays";
export * from "./shared/math";
export * from "./shared/reliability";

// Baseline API
export type { HistoricalWindow, BaselinePopulationProvider } from "./baseline/source";
export type { BaselineResult, BaselineEvaluationConfig } from "./baseline/engine";
export { evaluateBaseline } from "./baseline/engine";
export { median, percentile, iqr, recurrenceFraction, signedRelativeChange } from "./baseline/statistics";
export { CompletedTaskProvider, type TaskDataSource } from "./baseline/providers/completed-task-provider";
