export type WorkSession = {
  id: string;
  userId?: string;
  taskId?: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  targetDurationMinutes?: number | null;
  isPaused?: boolean;
  pausedAt?: string | null;
  lastResumedAt?: string | null;
  source: "manual" | "derived";
  notes?: string | null;
  taskTitle?: string | null;
  goalTitle?: string | null;
};
