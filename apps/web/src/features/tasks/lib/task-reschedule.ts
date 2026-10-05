// apps/web/src/features/tasks/lib/task-reschedule.ts
export type RescheduleTarget = "today" | "tomorrow" | "next-week" | "backlog";

function shiftDay(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

export function resolveRescheduleDate(
  target: RescheduleTarget | { custom: string },
  today: string,
): string | null {
  if (typeof target === "object") return target.custom;
  if (target === "today") return today;
  if (target === "tomorrow") return shiftDay(today, 1);
  if (target === "next-week") return shiftDay(today, 7);
  return null;
}
