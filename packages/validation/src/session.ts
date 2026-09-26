import { z } from "zod";

export const sessionCreateSchema = z.object({
  taskId: z.string().min(1).nullable().optional(),
  targetDurationMinutes: z.number().int().min(1).max(720).nullable().optional(),
  startedAt: z.coerce.date().optional(),
  endedAt: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const sessionUpdateSchema = z.object({
  taskId: z.string().min(1).nullable().optional(),
  targetDurationMinutes: z.number().int().min(1).max(720).nullable().optional(),
  endedAt: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const sessionListQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  taskId: z.string().min(1).optional(),
  search: z.string().trim().optional(),
});

export type SessionListQueryInput = z.infer<typeof sessionListQuerySchema>;
export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;
export type SessionUpdateInput = z.infer<typeof sessionUpdateSchema>;
