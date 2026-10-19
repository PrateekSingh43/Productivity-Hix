import { z } from "zod";

/**
 * Phase 1 Task Attribution validation (R1/R2/R5).
 *
 * targetKind is explicit and never inferred: "TASK" requires a taskId
 * (checked at the service boundary for a 400 with a clear message), "NONE"
 * asserts the window belongs to no task. Both may carry a reason and,
 * for corrections, a backward supersedes pointer.
 */

export const workContextSwitchSchema = z
  .object({
    taskId: z.string().min(1).nullable().optional(),
    goalId: z.string().min(1).nullable().optional(),
    startedAt: z.coerce.date().optional(),
  })
  .refine((v) => Boolean(v.taskId) || Boolean(v.goalId), {
    message: "A work context requires a taskId or goalId target",
  });

export const workContextEndSchema = z.object({
  endedAt: z.coerce.date().optional(),
});

export const workContextHistoryQuerySchema = z.object({
  taskId: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const attributionCorrectionCreateSchema = z.object({
  windowStart: z.coerce.date(),
  windowEnd: z.coerce.date(),
  targetKind: z.enum(["TASK", "NONE"]),
  taskId: z.string().min(1).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  supersedesCorrectionId: z.string().min(1).nullable().optional(),
});

export const attributionCorrectionListQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  taskId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const taskEvidenceQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export type WorkContextSwitchInput = z.infer<typeof workContextSwitchSchema>;
export type WorkContextEndInput = z.infer<typeof workContextEndSchema>;
export type WorkContextHistoryQueryInput = z.infer<typeof workContextHistoryQuerySchema>;
export type AttributionCorrectionCreateInput = z.infer<typeof attributionCorrectionCreateSchema>;
export type AttributionCorrectionListQueryInput = z.infer<
  typeof attributionCorrectionListQuerySchema
>;
