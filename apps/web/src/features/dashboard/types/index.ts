import type { ActivitySummary, ProductivityPattern } from "@repo/types";

export interface DailyAnalytics {
  date: string;
  activity: ActivitySummary;
  taskCompletionRate: number;
  checkIns: number;
  patterns: ProductivityPattern[];
}

export type { ActivitySummary, ProductivityPattern };
