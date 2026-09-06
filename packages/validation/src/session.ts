import { z } from "zod";

export const sessionCreateSchema = z.object({
  taskId: z.string().uuid().nullable().optional(),
  startedAt: z.coerce.date().optional(),
  endedAt: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const sessionUpdateSchema = z.object({
  taskId: z.string().uuid().nullable().optional(),
  endedAt: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
