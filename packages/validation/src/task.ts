import { z } from "zod";

const taskBaseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(["none", "low", "medium", "high"]).optional(),
  plannedDurationMinutes: z.coerce.number().int().nonnegative().optional(),
  plannedStart: z.coerce.date().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  goalId: z.string().min(1).nullable().optional(),
  productiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").nullable().optional(),
});

export const taskCreateSchema = taskBaseSchema.extend({
  priority: z.enum(["none", "low", "medium", "high"]).optional().default("medium"),
  plannedDurationMinutes: z.coerce.number().int().nonnegative().optional().default(30),
});

export const taskUpdateSchema = taskBaseSchema.partial().extend({
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
