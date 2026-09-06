export type WorkSession = {
  id: string;
  userId?: string;
  taskId?: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  source: "manual" | "derived";
  notes?: string | null;
};
