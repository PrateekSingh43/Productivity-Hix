import type { ActivitySummary } from "./activity";

export type DailySummary = {
  date: string;
  activity: ActivitySummary;
  tasksCompleted: number;
  tasksCreated: number;
  checkIns: number;
  recallScore: number | null;
};

export type WeeklySummary = {
  weekOf: string;
  days: DailySummary[];
};

export type ProductivityPattern = {
  dimension: "hour" | "day";
  key: string;
  sessions: number;
  completedTasks: number;
  activeSeconds: number;
};
