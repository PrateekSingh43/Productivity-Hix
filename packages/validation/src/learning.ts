import { z } from "zod";

export const learningAssessmentCreateSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  scheduledAt: z.coerce.date().optional(),
  questions: z
    .array(
      z.object({
        prompt: z.string().trim().min(1).max(1000),
        expectedAnswer: z.string().trim().max(2000).nullable().optional(),
      }),
    )
    .min(1)
    .max(20),
});

export const learningAnswerSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.string().trim().max(2000),
  score: z.number().min(0).max(1).nullable().optional(),
});
