// apps/web/src/features/tasks/lib/task-provenance.ts
import { format } from "date-fns";
import type { Task } from "@repo/types";

type ProvenanceInput = Pick<Task, "createdAt" | "dueAt" | "productiveDate" | "completedAt">;

function fmt(iso: string, pattern: string): string | null {
  try {
    return format(new Date(iso), pattern);
  } catch {
    return null;
  }
}

export function formatTaskProvenance(task: ProvenanceInput): string[] {
  const tokens: string[] = [];
  const created = task.createdAt ? fmt(task.createdAt, "MMM d, h:mm a") : null;
  if (created) tokens.push(`Created: ${created}`);
  if (task.dueAt) {
    const due = fmt(task.dueAt, "MMM d");
    if (due) tokens.push(`Due: ${due}`);
  }
  if (task.productiveDate) tokens.push(`Scheduled: ${task.productiveDate}`);
  if (task.completedAt) {
    const done = fmt(task.completedAt, "MMM d, h:mm a");
    if (done) tokens.push(`Completed: ${done}`);
  }
  return tokens;
}
