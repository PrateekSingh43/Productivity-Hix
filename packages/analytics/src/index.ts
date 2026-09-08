export { summarizeActivity } from "./activity/aggregate";
export { isCodingActivity, isIdleActivity } from "./activity/categories";
export { deriveSessions } from "./activity/sessions";
export { findDiscrepancies } from "./productivity/discrepancies";
export { productivityPatterns } from "./productivity/patterns";
export { taskCompletionRate } from "./productivity/metrics";
export { averageRecallScore } from "./learning/scores";
export { retentionScore } from "./learning/retention";
export { timeOfDaySeconds } from "./time/patterns";
export type { SelfReportDiscrepancy } from "./productivity/discrepancies";
export {
  aggregateActivitySegments,
  computeTimelineSummary,
  normalizeAppName,
  cleanWindowTitle,
  categorizeActivity,
  normalizeRawActivityEvents,
  normalizeIntervals,
} from "./activity/segments";
export type {
  RawActivityInput,
  CanonicalActivityEvent,
  AggregationOptions,
} from "./activity/segments";
export * from "./features";

