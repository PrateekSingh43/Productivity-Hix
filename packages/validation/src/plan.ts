import { z } from "zod";

export const goalOutcomeSchema = z
  .enum(["ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED", "NOT_ASSESSED"])
  .nullable();

export const goalSubTaskInputSchema = z.object({
  title: z.string().trim().min(1, "Task title is required"),
  plannedDurationMinutes: z.number().int().min(5).max(720).optional().default(60),
  productiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Productive date must be YYYY-MM-DD").optional(),
  dueAt: z.string().datetime().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
});

export const goalInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1, "Goal title is required").max(300),
  order: z.number().int().optional().default(0),
  outcome: goalOutcomeSchema.optional(),
  newTasks: z.array(z.union([z.string().trim().min(1), goalSubTaskInputSchema])).optional(),
});

export const dailyPlanUpsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  goals: z.array(goalInputSchema).optional().default([]),
});

export const goalOutcomeUpdateSchema = z.object({
  outcome: goalOutcomeSchema,
});

export type GoalSubTaskInput = z.infer<typeof goalSubTaskInputSchema>;
export type GoalInput = z.infer<typeof goalInputSchema>;
export type DailyPlanUpsertInput = z.infer<typeof dailyPlanUpsertSchema>;
export type GoalOutcomeUpdateInput = z.infer<typeof goalOutcomeUpdateSchema>;
