import { z } from "zod";

export const goalOutcomeSchema = z
  .enum(["ACHIEVED", "PARTIALLY_ACHIEVED", "NOT_ACHIEVED", "NOT_ASSESSED"])
  .nullable();

export const goalInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Goal title is required").max(300),
  order: z.number().int().optional().default(0),
  outcome: goalOutcomeSchema.optional(),
});

export const dailyPlanUpsertSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  goals: z.array(goalInputSchema).optional().default([]),
});

export const goalOutcomeUpdateSchema = z.object({
  outcome: goalOutcomeSchema,
});

export type GoalInput = z.infer<typeof goalInputSchema>;
export type DailyPlanUpsertInput = z.infer<typeof dailyPlanUpsertSchema>;
export type GoalOutcomeUpdateInput = z.infer<typeof goalOutcomeUpdateSchema>;
