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
    notes?: string | null;
  }>;
};
