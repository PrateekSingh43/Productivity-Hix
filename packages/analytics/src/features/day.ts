import type { CheckIn, Task } from "@repo/types";
import { taskCompletionRate } from "../productivity/metrics";
import type { SessionFeatures } from "./session";

export interface DayFeatures {
  date: string;
  totalSessionCount: number;
  totalSessionDurationSeconds: number;
  totalProductiveDurationSeconds: number;
  totalDistractionDurationSeconds: number;
  totalContextSwitches: number;
  averageSessionDurationSeconds: number;
  longestSessionDurationSeconds: number;
  completedTaskCount: number;
  createdTaskCount: number;
  taskCompletionRate: number;
  checkInCount: number;
}

export type DayTaskInput = Pick<Task, "status"> & Partial<Pick<Task, "createdAt">>;

export interface DayFeatureInput {
  date: string;
  sessionFeatures?: SessionFeatures[];
  tasks?: DayTaskInput[];
  checkIns?: CheckIn[];
}

/**
 * Extracts canonical day-level measurement features.
 */
export function extractDayFeatures(input: DayFeatureInput): DayFeatures {
  const { date, sessionFeatures = [], tasks = [], checkIns = [] } = input;

  const totalSessionCount = sessionFeatures.length;
  const totalSessionDurationSeconds = sessionFeatures.reduce((sum, s) => sum + s.durationSeconds, 0);
  const totalProductiveDurationSeconds = sessionFeatures.reduce((sum, s) => sum + s.productiveDurationSeconds, 0);
  const totalDistractionDurationSeconds = sessionFeatures.reduce((sum, s) => sum + s.distractionDurationSeconds, 0);
  const totalContextSwitches = sessionFeatures.reduce((sum, s) => sum + s.contextSwitchCount, 0);

  const averageSessionDurationSeconds =
    totalSessionCount > 0 ? Math.round(totalSessionDurationSeconds / totalSessionCount) : 0;

  const longestSessionDurationSeconds =
    totalSessionCount > 0 ? Math.max(...sessionFeatures.map((s) => s.durationSeconds)) : 0;

  const completedTaskCount = tasks.filter((t) => t.status === "done").length;
  const createdTaskCount = tasks.filter((t) => {
    if (!t.createdAt) return false;
    const ms = Date.parse(t.createdAt);
    if (Number.isNaN(ms)) return false;
    return new Date(ms).toISOString().slice(0, 10) === date;
  }).length;
  const rate = taskCompletionRate(tasks);

  const checkInCount = checkIns.length;

  return {
    date,
    totalSessionCount,
    totalSessionDurationSeconds,
    totalProductiveDurationSeconds,
    totalDistractionDurationSeconds,
    totalContextSwitches,
    averageSessionDurationSeconds,
    longestSessionDurationSeconds,
    completedTaskCount,
    createdTaskCount,
    taskCompletionRate: rate,
    checkInCount,
  };
}
