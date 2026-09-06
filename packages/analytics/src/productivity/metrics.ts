import type { Task } from "@repo/types";

export function taskCompletionRate(tasks: Pick<Task, "status">[]) {
  if (tasks.length === 0) return 0;
  return tasks.filter((task) => task.status === "done").length / tasks.length;
}
