export * from "./catalog";
export * from "./promotion";
export * from "./evidence-assembler";
export * from "./pipeline";
export * from "./copy";
export * from "./lineage";
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
export { CompletedTasksAdapter, type TaskDataSource } from "./baseline/providers/completed-tasks-adapter";
export { PrismaTaskDataSource } from "./baseline/providers/prisma-task-data-source";

// Detectors
export * from "./detectors/context-switching/types";
export * from "./detectors/context-switching/sequence";
export * from "./detectors/context-switching/episode";
export * from "./detectors/context-switching/pattern";
export * from "./detectors/context-switching/detector";
export * from "./detectors/task-fragmentation";
export * from "./detectors/continuous-activity";
export * from "./detectors/schedule-variance";
