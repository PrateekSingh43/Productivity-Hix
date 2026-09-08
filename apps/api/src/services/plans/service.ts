import type { DailyGoal, DailyPlan, DayPlanResponse, GoalOutcome, Task } from "@repo/types";
import { getDb } from "../../lib/prisma";
import { serializeTask } from "../tasks/service";

function serializeGoal(goal: {
  id: string;
  planId: string;
  userId: string;
  title: string;
  order: number;
  outcome: string | null;
  createdAt: Date;
  updatedAt: Date;
  tasks?: any[];
}): DailyGoal {
  return {
    id: goal.id,
    planId: goal.planId,
    userId: goal.userId,
    title: goal.title,
    order: goal.order,
    outcome: (goal.outcome as GoalOutcome) ?? null,
    tasks: goal.tasks ? goal.tasks.map(serializeTask) : [],
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

function serializePlan(plan: {
  id: string;
  userId: string;
  date: string;
  createdAt: Date;
  updatedAt: Date;
  goals: any[];
}): DailyPlan {
  return {
    id: plan.id,
    userId: plan.userId,
    date: plan.date,
    goals: plan.goals.map(serializeGoal),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export async function getDayPlan(userId: string, date: string): Promise<DayPlanResponse> {
  const db = getDb();

  // 1. Fetch Daily Plan record if exists
  const plan = await db.dailyPlan.findUnique({
    where: {
      userId_date: {
        userId,
        date,
      },
    },
    include: {
      goals: {
        orderBy: { order: "asc" },
        include: {
          tasks: {
            where: {
              OR: [
                { productiveDate: date },
                { productiveDate: null },
              ],
            },
            include: {
              goal: {
                select: {
                  id: true,
                  title: true,
                },
              },
              sessions: {
                select: {
                  id: true,
                  startedAt: true,
                  endedAt: true,
                  durationSeconds: true,
                  notes: true,
                },
                orderBy: { startedAt: "desc" },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  // 2. Fetch independent tasks for today (goalId is null and productiveDate matches today)
  const independentTasksRaw = await db.task.findMany({
    where: {
      userId,
      goalId: null,
      productiveDate: date,
    },
    include: {
      sessions: {
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
          notes: true,
        },
        orderBy: { startedAt: "desc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const independentTasks = independentTasksRaw.map(serializeTask);
  const serializedGoals = plan ? plan.goals.map(serializeGoal) : [];

  return {
    date,
    hasPlan: Boolean(plan && plan.goals.length > 0),
    plan: plan ? serializePlan(plan) : null,
    goals: serializedGoals,
    independentTasks,
  };
}

export async function upsertPlan(
  userId: string,
  input: {
    date: string;
    goals?: Array<{
      id?: string;
      title: string;
      order?: number;
      outcome?: GoalOutcome | null;
    }>;
  },
): Promise<DayPlanResponse> {
  const db = getDb();

  // 1. Ensure DailyPlan record exists
  const plan = await db.dailyPlan.upsert({
    where: {
      userId_date: {
        userId,
        date: input.date,
      },
    },
    create: {
      userId,
      date: input.date,
    },
    update: {},
  });

  const submittedGoals = input.goals ?? [];

  // 2. Reconcile Goals
  // Get existing goals in DB for this plan
  const existingGoals = await db.dailyGoal.findMany({
    where: { planId: plan.id, userId },
  });

  const submittedIds = new Set(submittedGoals.map((g) => g.id).filter(Boolean));

  // Delete goals that were removed from the plan
  // Due to onDelete: SetNull on Task.goalId, tasks will have their goalId set to null (independent)
  const toDelete = existingGoals.filter((g) => !submittedIds.has(g.id));
  if (toDelete.length > 0) {
    await db.dailyGoal.deleteMany({
      where: {
        id: { in: toDelete.map((g) => g.id) },
        userId,
      },
    });
  }

  // Upsert submitted goals
  for (let i = 0; i < submittedGoals.length; i++) {
    const g = submittedGoals[i];
    const order = g.order ?? i;
    if (g.id && existingGoals.some((eg) => eg.id === g.id)) {
      await db.dailyGoal.update({
        where: { id: g.id, userId },
        data: {
          title: g.title,
          order,
          outcome: g.outcome ?? undefined,
        },
      });
    } else {
      await db.dailyGoal.create({
        data: {
          planId: plan.id,
          userId,
          title: g.title,
          order,
          outcome: g.outcome ?? null,
        },
      });
    }
  }

  return getDayPlan(userId, input.date);
}

export async function updateGoalOutcome(
  userId: string,
  goalId: string,
  outcome: GoalOutcome | null,
): Promise<DailyGoal | null> {
  const db = getDb();

  const updated = await db.dailyGoal.update({
    where: { id: goalId, userId },
    data: { outcome },
    include: {
      tasks: {
        include: {
          sessions: true,
        },
      },
    },
  });

  return serializeGoal(updated);
}

export async function deleteGoal(userId: string, goalId: string): Promise<{ success: boolean }> {
  const db = getDb();

  await db.dailyGoal.delete({
    where: { id: goalId, userId },
  });

  return { success: true };
}
