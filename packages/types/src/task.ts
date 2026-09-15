export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "none" | "low" | "medium" | "high";

export type Task = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  plannedDurationMinutes: number;
  plannedStart?: string | null;
  actualDurationSeconds?: number;
  dueAt: string | null;
  completedAt: string | null;
  goalId?: string | null;
  goalTitle?: string | null;
  productiveDate?: string | null;
  createdAt: string;
  updatedAt: string;
  sessionsCount?: number;
  hasActiveSession?: boolean;
};

export type TaskWithSessions = Task & {
  sessions: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    durationSeconds: number | null;
    isPaused?: boolean;
    lastResumedAt?: string | null;
    notes?: string | null;
  }>;
  checkIns?: Array<{
    id: string;
    activityAssessment?: string | null;
    alignment?: string | null;
    energy?: string | null;
    focus?: string | null;
    note?: string | null;
    outcome?: string | null;
    blocker?: string | null;
    createdAt: string;
  }>;
};

export interface TaskObservedActivityItem {
  application: string;
  domain?: string | null;
  title: string;
  durationSeconds: number;
  percentage?: number;
}
