// apps/web/src/features/sessions/lib/session-start.ts
export function resolveSessionStartInput(
  selectedTaskId: string | null,
  customTopic: string,
  selectedDuration: number,
  fallbackPlanned?: number | null,
): { taskId: string | null; notes: string; durationMinutes: number } {
  const topic = customTopic.trim();
  const durationMinutes = selectedDuration > 0 ? selectedDuration : (fallbackPlanned ?? 25);
  return {
    taskId: selectedTaskId,
    notes: topic || "Deliberate focus session",
    durationMinutes,
  };
}
