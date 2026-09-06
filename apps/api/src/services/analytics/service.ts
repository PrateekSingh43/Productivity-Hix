import { productivityPatterns, taskCompletionRate } from "@repo/analytics";
import { getDb } from "../../lib/prisma";
import { activityInRange, activitySummary, utcDayRange } from "../activity/service";

export async function dailyAnalytics(userId: string) {
  const range = utcDayRange();
  const [activity, tasks, checkIns] = await Promise.all([
    activitySummary(userId, range.from, range.to),
    getDb().task.findMany({
      where: {
        userId,
        createdAt: { lt: range.to },
        OR: [{ completedAt: { gte: range.from } }, { status: { not: "cancelled" } }],
      },
    }),
    getDb().checkIn.count({ where: { userId, createdAt: { gte: range.from, lt: range.to } } }),
  ]);
  const events = await activityInRange(userId, range.from, range.to);
  return {
    date: range.from.toISOString().slice(0, 10),
    activity,
    taskCompletionRate: taskCompletionRate(tasks),
    checkIns,
    patterns: productivityPatterns(events),
  };
}
