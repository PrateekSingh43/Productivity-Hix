import type { Task } from "./task";

export type GoalOutcome =
  | "ACHIEVED"
  | "PARTIALLY_ACHIEVED"
  | "NOT_ACHIEVED"
  | "NOT_ASSESSED";

export interface DailyGoal {
  id: string;
  planId: string;
  userId: string;
  title: string;
  order: number;
  outcome?: GoalOutcome | null;
  tasks?: Task[];
  createdAt: string;
  updatedAt: string;
}

export interface DailyPlan {
  id: string;
  userId: string;
  date: string; // "YYYY-MM-DD"
  goals: DailyGoal[];
  createdAt: string;
  updatedAt: string;
}

export interface DayPlanResponse {
  date: string; // "YYYY-MM-DD"
  hasPlan: boolean;
  plan: DailyPlan | null;
  goals: DailyGoal[];
  independentTasks: Task[];
}
